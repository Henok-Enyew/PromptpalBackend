import Prompt from '../models/prompt.model.js';
import { PUBLIC_AUTHOR_FIELDS } from '../utils/user.util.js';
import AppError from '../utils/appError.util.js';
import { CreatePromptInput, UpdatePromptInput, FeedQueryParams } from '../validation/prompt.schema.js';
import { cloudinary } from '../utils/cloudinary.util.js';
import logger from '../config/logger.config.js';
import Comment from '../models/comment.model.js';
import { literalRegex } from '../utils/regex.util.js';
import { extractTemplateVariables } from '../utils/template.util.js';
import { MAX_PROMPT_VERSIONS, MAX_TEST_CASES } from '../models/prompt.model.js';
import { assertPrivatePromptAllowed } from './quota.service.js';

// Large owner-only arrays that list/detail queries never need to load.
const OWNER_ONLY_EXCLUDED = { versions: 0, testCases: 0 } as const;

/** The subset of the authenticated user that access checks need. */
export type PromptRequester = { _id: unknown; role?: string } | undefined;

const isAdmin = (requester: PromptRequester) =>
  requester?.role === 'admin' || requester?.role === 'superadmin';

/**
 * Mongo filter for prompts the requester is allowed to see: public and not
 * hidden, or owned by the requester; admins see everything that isn't deleted.
 * Every read of a prompt (or of anything nested under one) must use this.
 */
export const buildPromptAccessFilter = (requester?: PromptRequester) => {
  if (isAdmin(requester)) return { isDeleted: false };

  const visibleToAll = { isPublic: true, isHidden: false };
  if (!requester) return { isDeleted: false, ...visibleToAll };

  return {
    isDeleted: false,
    $or: [visibleToAll, { user: requester._id }],
  };
};

/**
 * Load a prompt the requester may see, or throw 404. Unauthorized and missing
 * prompts are indistinguishable on purpose.
 */
export const findAccessiblePrompt = async (
  promptId: string,
  requester?: PromptRequester,
) => {
  const prompt = await Prompt.findOne({
    _id: promptId,
    ...buildPromptAccessFilter(requester),
  });
  if (!prompt) {
    throw new AppError('Prompt not found.', 404);
  }
  return prompt;
};

export const createPrompt = async (
  userId: string,
  input: CreatePromptInput,
  imageUrl?: string,
) => {
  const promptData: any = {
    ...input,
    user: userId,
  };

  // Handle multiple outputs if provided
  if (input.outputs && input.outputs.length > 0) {
    promptData.outputs = input.outputs;
    
    // Find first image output to use as main imageUrl/sampleOutput
    const firstImageOutput = input.outputs.find((o: any) => o.type === 'image' && o.content);
    if (firstImageOutput) {
      promptData.sampleOutput = firstImageOutput.content;
      if (!promptData.mediaType) {
        promptData.mediaType = 'image';
      }
    } else {
      // Use first output as sampleOutput for backward compatibility
      promptData.sampleOutput = input.outputs[0].content;
      // Set mediaType from first output if not already set
      if (!promptData.mediaType && input.outputs[0].type !== 'url' && input.outputs[0].type !== 'text') {
        promptData.mediaType = input.outputs[0].type;
      }
    }
    
    // If imageUrl is provided (from legacy upload), use it for the first image output
    if (imageUrl && promptData.mediaType === 'image') {
      const firstImageIndex = input.outputs.findIndex((o: any) => o.type === 'image');
      if (firstImageIndex !== -1) {
        promptData.outputs[firstImageIndex].content = imageUrl;
        promptData.sampleOutput = imageUrl;
      }
    }
  } else {
    // Legacy single output support
    promptData.sampleOutput = imageUrl || input.sampleOutput;
    if (imageUrl) {
      promptData.mediaType = 'image';
      promptData.sampleOutput = imageUrl;
    }
  }

  if (promptData.isPublic === false) await assertPrivatePromptAllowed(userId);

  const prompt = await Prompt.create(promptData);
  
  await prompt.populate({
    path: 'user',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  return prompt;
};

const FEED_SORTS = {
  newest: { createdAt: -1, _id: -1 },
  likes: { likesCount: -1, createdAt: -1, _id: -1 },
  shares: { shares: -1, createdAt: -1, _id: -1 },
} as const;

export const getFeed = async (query: FeedQueryParams) => {
  const { page = 1, limit = 20, tag, aiModel, search, sort = 'newest' } = query;
  const sortSpec = FEED_SORTS[sort] ?? FEED_SORTS.newest;

  const filter: any = {
    isPublic: true,
    isHidden: false,
    isDeleted: false,
  };

  if (tag) {
    filter.tags = { $in: [tag] };
  }

  if (aiModel) {
    filter.aiModel = literalRegex(String(aiModel));
  }

  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * limit;

  let queryBuilder = Prompt.find(filter, OWNER_ONLY_EXCLUDED)
    .populate({
      path: 'user',
      select: PUBLIC_AUTHOR_FIELDS,
    })
    .sort(sortSpec)
    .skip(skip)
    .limit(limit);

  if (search) {
    queryBuilder = queryBuilder.sort({ score: { $meta: 'textScore' }, ...sortSpec });
  }

  const prompts = await queryBuilder;

  const total = await Prompt.countDocuments(filter);

  // Get comment counts for all prompts efficiently using aggregation
  const promptIds = prompts.map((p) => p._id);
  const commentCounts = await Comment.aggregate([
    {
      $match: {
        prompt: { $in: promptIds },
        isDeleted: false,
        isHidden: false,
      },
    },
    { $group: { _id: '$prompt', count: { $sum: 1 } } },
  ]);

  // Create a map for quick lookup
  const commentCountMap = new Map(
    commentCounts.map((item) => [item._id.toString(), item.count]),
  );

  // Add likesCount, commentCount, and sharesCount to each prompt
  const promptsWithCounts = prompts.map((prompt) => {
    const promptId = String(prompt._id);
    const promptObj = prompt.toObject();
    return {
      ...promptObj,
      likesCount: prompt.likes?.length || 0,
      commentCount: commentCountMap.get(promptId) || 0,
      sharesCount: prompt.shares || 0,
    };
  });

  return {
    prompts: promptsWithCounts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  };
};

export const getPromptById = async (
  promptId: string,
  requester?: PromptRequester,
) => getVisiblePrompt({ _id: promptId }, requester);

export const getPromptBySlug = async (
  slug: string,
  requester?: PromptRequester,
) => getVisiblePrompt({ slug }, requester);

const getVisiblePrompt = async (
  match: { _id: string } | { slug: string },
  requester?: PromptRequester,
) => {
  const prompt = await Prompt.findOneAndUpdate(
    { ...match, ...buildPromptAccessFilter(requester) },
    { $inc: { views: 1 } },
    { new: true, projection: OWNER_ONLY_EXCLUDED },
  ).populate({
    path: 'user',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  if (!prompt) {
    throw new AppError('Prompt not found.', 404);
  }

  // Add likesCount, commentCount, and sharesCount
  const promptObj = prompt.toObject();
  const commentCount = await Comment.countDocuments({
    prompt: prompt._id,
    isDeleted: false,
    isHidden: false,
  });

  return {
    ...promptObj,
    likesCount: prompt.likes?.length || 0,
    commentCount,
    sharesCount: prompt.shares || 0,
  };
};

export const updatePrompt = async (
  promptId: string,
  userId: string,
  input: UpdatePromptInput,
  userRole: string,
  imageUrl?: string,
) => {
  const prompt = await Prompt.findById(promptId);

  if (!prompt) {
    throw new AppError('Prompt not found.', 404);
  }

  const isOwner = prompt.user.toString() === userId.toString();
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isOwner && !isAdmin) {
    throw new AppError(
      'You do not have permission to update this prompt.',
      403,
    );
  }

  const promptData: any = { ...input };

  // Handle multiple outputs if provided
  if (input.outputs && Array.isArray(input.outputs) && input.outputs.length > 0) {
    promptData.outputs = input.outputs;
    
    // Find first image output to use as main imageUrl/sampleOutput
    const firstImageOutput = input.outputs.find((o: any) => o.type === 'image' && o.content);
    if (firstImageOutput) {
      promptData.sampleOutput = firstImageOutput.content;
      if (!promptData.mediaType) {
        promptData.mediaType = 'image';
      }
    } else {
      // Use first output as sampleOutput for backward compatibility
      promptData.sampleOutput = input.outputs[0].content;
      // Set mediaType from first output if not already set
      if (!promptData.mediaType && input.outputs[0].type !== 'url' && input.outputs[0].type !== 'text') {
        promptData.mediaType = input.outputs[0].type;
      }
    }
    
    // If imageUrl is provided (from legacy upload), use it for the first image output
    if (imageUrl && promptData.mediaType === 'image') {
      const firstImageIndex = input.outputs.findIndex((o: any) => o.type === 'image');
      if (firstImageIndex !== -1) {
        promptData.outputs[firstImageIndex].content = imageUrl;
        promptData.sampleOutput = imageUrl;
      }
    }
  } else {
    // Legacy single output support
    if (imageUrl) {
      promptData.sampleOutput = imageUrl;
      if (!promptData.mediaType) {
        promptData.mediaType = 'image';
      }
    }
  }

  const textChanged =
    typeof promptData.promptText === 'string' && promptData.promptText !== prompt.promptText;

  // Making a public prompt private counts against the owner's private cap.
  if (isOwner && prompt.isPublic && promptData.isPublic === false) {
    await assertPrivatePromptAllowed(userId, promptId);
  }

  Object.keys(promptData).forEach((key) => {
    if (promptData[key] !== undefined) {
      (prompt as any)[key] = promptData[key];
    }
  });

  // The document was loaded with its full version history, so appending
  // here and saving is safe.
  if (textChanged) appendVersion(prompt, prompt.promptText, userId, 'Edited');

  await prompt.save();

  await prompt.populate({
    path: 'user',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  return prompt;
};

export const deletePrompt = async (
  promptId: string,
  userId: string,
  userRole: string,
) => {
  const prompt = await Prompt.findById(promptId);

  if (!prompt) {
    throw new AppError('Prompt not found.', 404);
  }

  const isOwner = prompt.user.toString() === userId.toString();
  const isAdmin = userRole === 'admin' || userRole === 'superadmin';

  if (!isOwner && !isAdmin) {
    throw new AppError(
      'You do not have permission to delete this prompt.',
      403,
    );
  }

  if (prompt.mediaType === 'image' && prompt.sampleOutput) {
    try {
      const url = prompt.sampleOutput;
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+)/);
      
      if (match && match[1]) {
        const publicIdWithFolder = match[1].replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');
        
        if (publicIdWithFolder) {
          await cloudinary.api.delete_resources([publicIdWithFolder]);
          logger.info(`[Cloudinary]: Deleted image ${publicIdWithFolder} for prompt ${promptId}`);
        }
      }
    } catch (error: any) {
      logger.error(
        error,
        `[Cloudinary]: Failed to delete image for prompt ${promptId}`,
      );
    }
  }

  await Prompt.findByIdAndDelete(promptId);

  return { message: 'Prompt deleted successfully.' };
};

export const toggleLike = async (
  promptId: string,
  requester: NonNullable<PromptRequester>,
) => {
  const prompt = await findAccessiblePrompt(promptId, requester);
  const userId = String(requester._id);

  const likeIndex = prompt.likes.findIndex(
    (id) => id.toString() === userId.toString(),
  );

  if (likeIndex > -1) {
    prompt.likes.splice(likeIndex, 1);
  } else {
    prompt.likes.push(userId as any);
  }

  await prompt.save();

  await prompt.populate({
    path: 'user',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  return prompt;
};

export const incrementShare = async (
  promptId: string,
  requester?: PromptRequester,
) => {
  const prompt = await Prompt.findOneAndUpdate(
    { _id: promptId, ...buildPromptAccessFilter(requester) },
    { $inc: { shares: 1 } },
    { new: true },
  );

  if (!prompt) {
    throw new AppError('Prompt not found.', 404);
  }

  // Shareable path (frontend builds the full URL); slug-less legacy prompts
  // fall back to the id, which the frontend redirects.
  const shareableUrl = `/prompts/${prompt.slug ?? promptId}`;

  return {
    prompt,
    shareableUrl,
    sharesCount: prompt.shares,
  };
};

export const getUserPrompts = async (
  userId: string,
  query: FeedQueryParams,
) => {
  const { page = 1, limit = 20, tag, aiModel, search } = query;

  const filter: any = {
    user: userId,
    isDeleted: false,
  };

  if (tag) {
    filter.tags = { $in: [tag] };
  }

  if (aiModel) {
    filter.aiModel = literalRegex(String(aiModel));
  }

  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * limit;

  let queryBuilder = Prompt.find(filter, OWNER_ONLY_EXCLUDED)
    .populate({
      path: 'user',
      select: PUBLIC_AUTHOR_FIELDS,
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (search) {
    queryBuilder = queryBuilder.sort({ score: { $meta: 'textScore' }, createdAt: -1 });
  }

  const prompts = await queryBuilder;

  const total = await Prompt.countDocuments(filter);

  // Get comment counts for all prompts efficiently using aggregation
  const promptIds = prompts.map((p) => p._id);
  const commentCounts = await Comment.aggregate([
    {
      $match: {
        prompt: { $in: promptIds },
        isDeleted: false,
        isHidden: false,
      },
    },
    { $group: { _id: '$prompt', count: { $sum: 1 } } },
  ]);

  // Create a map for quick lookup
  const commentCountMap = new Map(
    commentCounts.map((item) => [item._id.toString(), item.count]),
  );

  // Add likesCount, commentCount, and sharesCount to each prompt
  const promptsWithCounts = prompts.map((prompt) => {
    const promptId = String(prompt._id);
    const promptObj = prompt.toObject();
    return {
      ...promptObj,
      likesCount: prompt.likes?.length || 0,
      commentCount: commentCountMap.get(promptId) || 0,
      sharesCount: prompt.shares || 0,
    };
  });

  return {
    prompts: promptsWithCounts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  };
};

export const getUserFavorites = async (
  userId: string,
  query: FeedQueryParams,
) => {
  const { page = 1, limit = 20, tag, aiModel, search } = query;

  const filter: any = {
    likes: userId,
    ...buildPromptAccessFilter({ _id: userId }),
  };

  if (tag) {
    filter.tags = { $in: [tag] };
  }

  if (aiModel) {
    filter.aiModel = literalRegex(String(aiModel));
  }

  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * limit;

  let queryBuilder = Prompt.find(filter, OWNER_ONLY_EXCLUDED)
    .populate({
      path: 'user',
      select: PUBLIC_AUTHOR_FIELDS,
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  if (search) {
    queryBuilder = queryBuilder.sort({ score: { $meta: 'textScore' }, createdAt: -1 });
  }

  const prompts = await queryBuilder;

  const total = await Prompt.countDocuments(filter);

  // Get comment counts for all prompts efficiently using aggregation
  const promptIds = prompts.map((p) => p._id);
  const commentCounts = await Comment.aggregate([
    {
      $match: {
        prompt: { $in: promptIds },
        isDeleted: false,
        isHidden: false,
      },
    },
    { $group: { _id: '$prompt', count: { $sum: 1 } } },
  ]);

  // Create a map for quick lookup
  const commentCountMap = new Map(
    commentCounts.map((item) => [item._id.toString(), item.count]),
  );

  // Add likesCount, commentCount, and sharesCount to each prompt
  const promptsWithCounts = prompts.map((prompt) => {
    const promptId = String(prompt._id);
    const promptObj = prompt.toObject();
    return {
      ...promptObj,
      likesCount: prompt.likes?.length || 0,
      commentCount: commentCountMap.get(promptId) || 0,
      sharesCount: prompt.shares || 0,
    };
  });

  return {
    prompts: promptsWithCounts,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
  };
};


/**
 * Everything public that search engines should index, for the frontend's
 * build-time prerender and sitemap. Public data only; capped to keep the
 * build fast.
 */
export const getPublicSitemapPrompts = async (limit = 5000) =>
  Prompt.find(
    { isPublic: true, isHidden: false, isDeleted: false, slug: { $exists: true } },
    'slug title description aiModel tags mediaType sampleOutput updatedAt',
  )
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean();

// ---------------------------------------------------------------------------
// Version history and test cases (owner-only)
// ---------------------------------------------------------------------------

/** Append a version to a fully-loaded prompt document (caller saves). */
const appendVersion = (
  prompt: any,
  promptText: string,
  userId: unknown,
  changeSummary: string,
) => {
  const versions = prompt.versions ?? [];
  const nextNumber = (versions.at(-1)?.versionNumber ?? prompt.currentVersion ?? 0) + 1;
  versions.push({
    versionNumber: nextNumber,
    promptText,
    templateVariables: extractTemplateVariables(promptText),
    changeSummary,
    createdBy: userId,
    createdAt: new Date(),
  });
  // Keep the document bounded; the oldest versions go first.
  while (versions.length > MAX_PROMPT_VERSIONS) versions.shift();
  prompt.versions = versions;
  prompt.currentVersion = nextNumber;
  prompt.promptText = promptText;
};

/**
 * Load a prompt for its owner (or an admin, read-only use). Prompts the
 * requester can't see are 404; visible prompts owned by someone else are 403.
 */
const findOwnedPrompt = async (
  promptId: string,
  requester: NonNullable<PromptRequester>,
  { allowAdmin = false } = {},
) => {
  const prompt = await findAccessiblePrompt(promptId, requester);
  const isOwner = String(prompt.user) === String(requester._id);
  if (!isOwner && !(allowAdmin && isAdmin(requester))) {
    throw new AppError('Only the prompt owner can do this.', 403);
  }
  return prompt;
};

const serializeVersions = (prompt: any) => ({
  promptId: String(prompt._id),
  currentVersion: prompt.currentVersion ?? 1,
  versions: [...(prompt.versions ?? [])]
    .reverse()
    .map((v: any) => ({
      versionNumber: v.versionNumber,
      promptText: v.promptText,
      templateVariables: v.templateVariables ?? [],
      changeSummary: v.changeSummary ?? '',
      createdBy: v.createdBy ? String(v.createdBy) : null,
      createdAt: v.createdAt,
    })),
});

export const getPromptVersions = async (
  promptId: string,
  requester: NonNullable<PromptRequester>,
) => serializeVersions(await findOwnedPrompt(promptId, requester, { allowAdmin: true }));

export const createPromptVersion = async (
  promptId: string,
  requester: NonNullable<PromptRequester>,
  input: { promptText: string; changeSummary?: string },
) => {
  const prompt = await findOwnedPrompt(promptId, requester);
  if (input.promptText === prompt.promptText) {
    throw new AppError('The prompt text is unchanged.', 400);
  }
  appendVersion(prompt, input.promptText, requester._id, input.changeSummary || 'Edited');
  await prompt.save();
  return serializeVersions(prompt);
};

export const restorePromptVersion = async (
  promptId: string,
  versionNumber: number,
  requester: NonNullable<PromptRequester>,
) => {
  const prompt = await findOwnedPrompt(promptId, requester);
  const target = (prompt.versions ?? []).find((v: any) => v.versionNumber === versionNumber);
  if (!target) throw new AppError(`Version ${versionNumber} not found.`, 404);
  if (target.promptText === prompt.promptText) {
    throw new AppError(`Version ${versionNumber} is already the current text.`, 400);
  }
  appendVersion(prompt, target.promptText, requester._id, `Restored version ${versionNumber}`);
  await prompt.save();
  return serializeVersions(prompt);
};

const serializeTestCases = (prompt: any) => ({
  promptId: String(prompt._id),
  templateVariables: extractTemplateVariables(prompt.promptText ?? ''),
  testCases: (prompt.testCases ?? []).map((t: any) => ({
    id: String(t._id),
    name: t.name,
    variables: Object.fromEntries(t.variables ?? []),
    expectedAssertions: t.expectedAssertions ?? [],
  })),
});

export const getPromptTestCases = async (
  promptId: string,
  requester: NonNullable<PromptRequester>,
) => serializeTestCases(await findOwnedPrompt(promptId, requester, { allowAdmin: true }));

export const replacePromptTestCases = async (
  promptId: string,
  requester: NonNullable<PromptRequester>,
  testCases: { name: string; variables: Record<string, string>; expectedAssertions?: string[] }[],
) => {
  const prompt = await findOwnedPrompt(promptId, requester);
  if (testCases.length > MAX_TEST_CASES) {
    throw new AppError(`A prompt can have at most ${MAX_TEST_CASES} test cases.`, 400);
  }
  prompt.testCases = testCases.map((t) => ({
    name: t.name,
    variables: new Map(Object.entries(t.variables)),
    expectedAssertions: t.expectedAssertions ?? [],
  })) as any;
  await prompt.save();
  return serializeTestCases(prompt);
};
