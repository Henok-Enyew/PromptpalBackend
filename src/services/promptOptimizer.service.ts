import PromptOptimization from '../models/promptOptimization.model.js';
import { PUBLIC_AUTHOR_FIELDS } from '../utils/user.util.js';
import { literalRegex } from '../utils/regex.util.js';
import AppError from '../utils/appError.util.js';
import {
  QuickOptimizeInput,
  AnalyzePromptInput,
  BuildPromptInput,
  OptimizationHistoryParams,
} from '../validation/promptOptimizer.schema.js';
import { analyzePrompt, preValidatePrompt } from '../utils/promptAnalyzer.util.js';
import {
  generateQuestions,
  parseFreeFormInput,
  buildOptimizedPrompt,
  isGeminiAvailable,
  quickOptimizeWithAI,
  getOptimizerModelId,
} from '../utils/gemini.util.js';
import { withLLMCache } from './llmCache.service.js';
import { assertPrivatePromptAllowed } from './quota.service.js';
import { validateIntentPreservation } from '../utils/intentPreservation.util.js';
import { lintPrompt } from '../utils/promptLint.util.js';
import { LLMError } from '../services/llm/types.js';
import Prompt from '../models/prompt.model.js';
import { CreatePromptInput } from '../validation/prompt.schema.js';
import { ApplyOptimizationInput, FeedbackInput } from '../validation/promptOptimizer.schema.js';
import {
  questionCache,
  optimizationCache,
  generateQuestionsCacheKey,
  generateAnalysisCacheKey,
} from '../utils/cache.util.js';
import logger from '../config/logger.config.js';

const wordCountOf = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Quick optimization: the model returns a structured diagnosis and a
 * rewrite. We add deterministic lint checks for both versions. No score is
 * reported; to compare versions, benchmark them in the workbench.
 */
export const quickOptimize = async (
  userId: string,
  input: QuickOptimizeInput,
) => {
  const { originalPrompt, targetModel, mediaType } = input;
  const promptText = originalPrompt as string;

  const preValidation = preValidatePrompt(promptText);
  if (!preValidation.isAcceptable) {
    throw new AppError(
      preValidation.validationMessage || 'Prompt is not acceptable for optimization.',
      400,
    );
  }

  if (!isGeminiAvailable()) {
    logger.error('No AI provider is configured; quick optimization is unavailable.');
    throw new AppError(
      'AI optimization service is currently unavailable. Please try again later or contact support if the issue persists.',
      503,
    );
  }

  let result: Awaited<ReturnType<typeof quickOptimizeWithAI>>;
  let cached = false;
  try {
    // Identical requests within the cache window reuse the earlier rewrite.
    const out = await withLLMCache(
      'quick-optimize',
      { v: 1, model: getOptimizerModelId(), targetModel, mediaType, prompt: promptText },
      () => quickOptimizeWithAI(promptText, targetModel as string, mediaType),
    );
    result = out.value;
    cached = out.hit;
  } catch (error: any) {
    logger.error({ userId, errorMessage: error.message, code: error.code }, 'AI optimization failed');
    if (error instanceof LLMError && error.code === 'rate_limited') {
      throw new AppError('The AI provider is rate limiting requests. Please try again in a minute.', 429);
    }
    throw new AppError(
      'Failed to optimize prompt. The AI service encountered an error. Please try again in a moment. If the problem persists, contact support.',
      503,
    );
  }

  if (!result.isValid) {
    throw new AppError(result.validationMessage || 'Prompt is not valid for optimization.', 400);
  }

  const optimizedPrompt = result.rewrittenPrompt;
  const validationMessage = result.validationMessage || preValidation.validationMessage || undefined;

  return PromptOptimization.create({
    user: userId,
    originalPrompt: promptText,
    optimizedPrompt,
    targetModel,
    mediaType,
    optimizationType: 'quick',
    optimizationMode: 'complete',
    status: 'completed',
    diagnosis: {
      ambiguities: result.ambiguities,
      roleDefinition: result.roleDefinition,
      variables: result.variables,
      formattingConstraints: result.formattingConstraints,
      changes: result.changes,
    },
    lintChecks: {
      before: lintPrompt(promptText, mediaType),
      after: lintPrompt(optimizedPrompt, mediaType),
    },
    metadata: {
      wordCount: { before: wordCountOf(promptText), after: wordCountOf(optimizedPrompt) },
      usedAI: true,
      validationMessage,
      model: result.model,
      costUsd: cached ? 0 : result.costUsd,
      cached,
    },
  });
};

/**
 * Analyze prompt and generate questions
 * AI optimization is required - no fallback to template questions
 */
export const analyzePromptForQuestions = async (
  userId: string,
  input: AnalyzePromptInput,
) => {
  const { originalPrompt, targetModel, mediaType } = input;
  
  // Ensure originalPrompt is a string
  const promptString = String(originalPrompt);

  // Analyze the prompt
  const analysis = analyzePrompt(promptString, mediaType);

  // Generate quick optimized version using AI (required)
  let quickOptimized: string = promptString;
  
  if (!isGeminiAvailable()) {
    logger.error('Gemini is not available. AI optimization is required for premium questions.');
    throw new AppError(
      'AI optimization service is currently unavailable. Please try again later or contact support if the issue persists.',
      503,
    );
  }

  try {
    // Use AI to generate quick optimized version
    const quickOptimizeResult = await quickOptimizeWithAI(
      promptString,
      String(targetModel),
      mediaType,
    );
    quickOptimized = quickOptimizeResult.rewrittenPrompt;
    
    logger.info(
      {
        userId,
        originalLength: promptString.length,
        quickOptimizedLength: quickOptimized.length,
      },
      'Generated quick optimized version using AI',
    );
  } catch (error: any) {
    logger.error(
      {
        userId,
        originalPrompt: promptString.substring(0, 100),
        errorMessage: error.message,
      },
      'Failed to generate quick optimized version, using original',
    );
    // If AI fails for quick optimize, just use original - don't fail the whole request
    // The questions generation will still work
  }

  // Check cache first
  const cacheKey = generateQuestionsCacheKey(promptString, mediaType, String(targetModel));
  let questionsData = questionCache.get<any>(cacheKey);

  // Generate questions using Gemini (required - no template fallback)
  if (!questionsData) {
    if (!isGeminiAvailable()) {
      logger.error('Gemini is not available. AI is required for question generation.');
      throw new AppError(
        'AI optimization service is currently unavailable. Please try again later or contact support if the issue persists.',
        503,
      );
    }

    try {
      logger.info(
        {
          userId,
          originalPrompt: promptString.substring(0, 100),
          targetModel,
          mediaType,
        },
        'Generating premium questions with AI',
      );

      questionsData = await generateQuestions(promptString, mediaType, String(targetModel));
      
      logger.info(
        {
          userId,
          questionsCount: questionsData.questions?.length || 0,
        },
        'Successfully generated premium questions',
      );

      // Cache the questions
      questionCache.set(cacheKey, questionsData);
    } catch (error: any) {
      logger.error(
        {
          userId,
          originalPrompt: promptString.substring(0, 100),
          errorMessage: error.message,
          errorStack: error.stack,
        },
        'Failed to generate questions with AI',
      );
      
      // Check if it's a rate limit error
      const isRateLimit = error.message?.includes('rate limit') || 
                         error.message?.includes('Rate limit') ||
                         error.message?.includes('quota') ||
                         error.message?.includes('Quota exceeded') ||
                         error.message?.includes('429');
      
      if (isRateLimit) {
        // Extract retry delay if available from error message
        const retryDelayMatch = error.message?.match(/retry in ([\d.]+)s/i) || 
                                error.message?.match(/retryDelay.*?([\d.]+)s/i);
        const retryDelay = retryDelayMatch ? Math.ceil(parseFloat(retryDelayMatch[1])) : null;
        
        const rateLimitMessage = retryDelay
          ? `Rate limit exceeded. Please try again in ${retryDelay} seconds. You've hit the free tier limit (20 requests per day per model).`
          : 'Rate limit exceeded. Please try again later. You may have hit the free tier limit (20 requests per day per model).';
        
        throw new AppError(rateLimitMessage, 429);
      }
      
      throw new AppError(
        'Failed to generate optimization questions. The AI service encountered an error. Please try again in a moment.',
        503,
      );
    }
  } else {
    logger.info('Using cached questions for premium optimization');
  }

  // Create optimization record in 'analyzing' state
  const optimization = await PromptOptimization.create({
    user: userId,
    originalPrompt,
    optimizedPrompt: quickOptimized, // Quick fallback
    targetModel,
    mediaType,
    optimizationType: 'premium',
    optimizationMode: 'analyze',
    status: 'questions_ready',
    questions: questionsData.questions.map((q: any) => ({
      ...q,
      answered: false,
    })),
    analysis: {
      completenessScore: analysis.completenessScore,
      missingElements: analysis.missingElements,
      grammarFixed: analysis.grammarFixed,
      structureImproved: analysis.structureImproved,
    },
  });

  return {
    optimization,
    questions: questionsData.questions,
    additionalDetailsField: questionsData.additionalDetailsField,
    quickOptimized,
  };
};

/**
 * Build premium prompt from user answers
 */
export const buildPremiumPrompt = async (
  userId: string,
  input: BuildPromptInput,
) => {
  const { originalPrompt, targetModel, mediaType, answers, additionalDetails } = input;

  // Find existing optimization or create new one
  const optimization = await PromptOptimization.findOne({
    user: userId,
    originalPrompt,
    targetModel,
    mediaType,
    optimizationType: 'premium',
    status: 'questions_ready',
  }).sort({ createdAt: -1 });

  if (!optimization) {
    throw new AppError('No optimization found. Please analyze the prompt first.', 404);
  }

  // Parse additional details if provided (with media type context)
  let parsedDetails: Record<string, any> = {};
  if (additionalDetails && typeof additionalDetails === 'string' && additionalDetails.trim()) {
    if (isGeminiAvailable()) {
      try {
        parsedDetails = await parseFreeFormInput(additionalDetails, mediaType);
      } catch (error: any) {
        logger.error(error, 'Failed to parse additional details');
        parsedDetails = { other: additionalDetails };
      }
    } else {
      parsedDetails = { other: additionalDetails };
    }
  }

  // Build optimized prompt using Gemini
  let optimizedPrompt: string;
  if (isGeminiAvailable()) {
    try {
      const userAnswers: Record<string, any> = answers || {};
      const additionalDetailsStr: string = (additionalDetails && typeof additionalDetails === 'string') ? additionalDetails : '';
      optimizedPrompt = await buildOptimizedPrompt(
        originalPrompt as string,
        userAnswers,
        additionalDetailsStr || undefined,
        targetModel as string,
      );
    } catch (error: any) {
      logger.error(error, 'Failed to build prompt with Gemini');
      throw new AppError('Failed to build optimized prompt. Please try again.', 500);
    }
  } else {
    throw new AppError(
      'AI is not available. Please configure GROQ_API_KEY or GOOGLE_AI_API_KEY.',
      500,
    );
  }

  // Validate intent preservation
  const userAnswers: Record<string, any> = answers || {};
  const additionalDetailsStr: string = (additionalDetails && typeof additionalDetails === 'string') ? additionalDetails : '';
  const intentValidation = validateIntentPreservation(
    originalPrompt as string,
    optimizedPrompt,
    userAnswers,
    additionalDetailsStr || undefined,
  );

  // Log intent preservation violations if any
  if (!intentValidation.preserved) {
    logger.warn(
      {
        violations: intentValidation.violations,
        addedDetails: intentValidation.addedDetails,
      },
      'Intent preservation violations detected',
    );
  }

  // Heuristic: words in the result that the user never supplied. Shown as
  // "check these" warnings, not as a score.
  const intentWarnings = intentValidation.preserved ? [] : intentValidation.violations;

  // Update optimization record
  optimization.optimizedPrompt = optimizedPrompt;
  optimization.optimizationMode = 'complete';
  optimization.status = 'completed';
  optimization.userAnswers = userAnswers;
  optimization.additionalDetails = additionalDetailsStr || undefined;
  optimization.intentWarnings = intentWarnings;
  optimization.lintChecks = {
    before: lintPrompt(originalPrompt as string, mediaType),
    after: lintPrompt(optimizedPrompt, mediaType),
  };
  optimization.metadata = {
    wordCount: {
      before: wordCountOf(originalPrompt as string),
      after: wordCountOf(optimizedPrompt),
    },
    usedAI: true,
  };

  // Update question answers
  if (answers && optimization.questions) {
    optimization.questions = optimization.questions.map((q) => {
      const answer = answers[q.id];
      if (answer) {
        return {
          ...q,
          answered: true,
          answer,
        };
      }
      return q;
    });
  }

  await optimization.save();

  return optimization;
};

/**
 * Get optimization history with enhanced filtering
 */
export const getOptimizationHistory = async (
  userId: string,
  query: OptimizationHistoryParams,
) => {
  const { page = 1, limit = 20, targetModel, optimizationType } = query;

  const filter: any = {
    user: userId,
    status: 'completed', // Only show completed optimizations
  };

  if (targetModel) {
    filter.targetModel = literalRegex(String(targetModel));
  }

  if (optimizationType) {
    filter.optimizationType = optimizationType;
  }

  const skip = (page - 1) * limit;

  const optimizations = await PromptOptimization.find(filter)
    // Skip the questions array, and legacy before/after scores that were not
    // meaningful (older records still store them).
    .select('-questions -qualityScore -metadata.clarityScore -metadata.specificityScore -metadata.structureScore')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean(); // Use lean for better performance

  const total = await PromptOptimization.countDocuments(filter);

  // Calculate statistics
  const stats = await PromptOptimization.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalOptimizations: { $sum: 1 },
        quickCount: {
          $sum: { $cond: [{ $eq: ['$optimizationType', 'quick'] }, 1, 0] },
        },
        premiumCount: {
          $sum: { $cond: [{ $eq: ['$optimizationType', 'premium'] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    optimizations,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    limit,
    stats: stats[0] || {
      totalOptimizations: 0,
      quickCount: 0,
      premiumCount: 0,
    },
  };
};

/**
 * Get optimization by ID
 */
export const getOptimizationById = async (
  optimizationId: string,
  userId: string,
) => {
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
  }).select('-qualityScore -metadata.clarityScore -metadata.specificityScore -metadata.structureScore');

  if (!optimization) {
    throw new AppError('Optimization not found.', 404);
  }

  return optimization;
};

/**
 * Delete optimization
 */
export const deleteOptimization = async (
  optimizationId: string,
  userId: string,
) => {
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
  });

  if (!optimization) {
    throw new AppError('Optimization not found.', 404);
  }

  await PromptOptimization.findByIdAndDelete(optimizationId);

  return { message: 'Optimization deleted successfully.' };
};

/**
 * Apply optimization to create a new Prompt
 */
export const applyOptimization = async (
  userId: string,
  optimizationId: string,
  input: Omit<ApplyOptimizationInput, 'optimizationId'> & { imageUrl?: string; outputs?: any[] },
) => {
  const { title, description, tags, isPublic, sampleOutput, imageUrl, outputs } = input;

  // Get the optimization
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
    status: 'completed',
  });

  if (!optimization) {
    throw new AppError('Optimization not found or not completed.', 404);
  }

  if (!optimization.optimizedPrompt) {
    throw new AppError('Optimized prompt not available.', 400);
  }

  // Handle multiple outputs if provided, otherwise use legacy validation
  if (outputs && outputs.length > 0) {
    // Validate outputs
    for (const output of outputs) {
      if (!output.content || !output.content.trim()) {
        throw new AppError('All outputs must have content.', 400);
      }
    }
  } else {
    // Legacy validation
    if (optimization.mediaType === 'image') {
      if (!imageUrl) {
        throw new AppError('Image is required for image media type.', 400);
      }
    } else {
      if (!sampleOutput || !sampleOutput.trim()) {
        throw new AppError('Sample output is required for non-image media types.', 400);
      }
    }
  }

  // Create prompt from optimization
  const promptData: CreatePromptInput = {
    title,
    description,
    promptText: optimization.optimizedPrompt,
    sampleOutput: outputs && outputs.length > 0 
      ? outputs[0].content 
      : (optimization.mediaType === 'image' ? imageUrl! : sampleOutput!),
    outputs: outputs && outputs.length > 0 ? outputs : undefined,
    mediaType: optimization.mediaType,
    aiModel: optimization.targetModel,
    tags: tags || [],
    // Saved privately unless the user chooses to publish.
    isPublic: isPublic ?? false,
  };

  if (!promptData.isPublic) await assertPrivatePromptAllowed(userId);

  const prompt = await Prompt.create({
    ...promptData,
    user: userId,
    originalPromptText: optimization.originalPrompt,
    isOptimized: true,
    optimizationId: optimization._id,
  });

  await prompt.populate({
    path: 'user',
    select: PUBLIC_AUTHOR_FIELDS,
  });

  return prompt;
};

/**
 * Submit feedback on optimization
 */
export const submitFeedback = async (
  optimizationId: string,
  userId: string,
  input: FeedbackInput,
) => {
  const optimization = await PromptOptimization.findOne({
    _id: optimizationId,
    user: userId,
  });

  if (!optimization) {
    throw new AppError('Optimization not found.', 404);
  }

  // Add feedback to optimization (we'll store it in a feedback field)
  // For now, we'll add it to the document
  (optimization as any).feedback = {
    rating: input.rating,
    wasHelpful: input.wasHelpful,
    comments: input.comments,
    submittedAt: new Date(),
  };

  await optimization.save();

  return {
    message: 'Feedback submitted successfully.',
    feedback: {
      rating: input.rating,
      wasHelpful: input.wasHelpful,
      comments: input.comments,
    },
  };
};

