/**
 * @swagger
 * components:
 *   schemas:
 *     Prompt:
 *       type: object
 *       required:
 *         - user
 *         - title
 *         - promptText
 *         - sampleOutput
 *         - mediaType
 *         - aiModel
 *       properties:
 *         _id:
 *           type: string
 *           description: Prompt ID
 *           example: 507f1f77bcf86cd799439011
 *         user:
 *           type: string
 *           description: User ID who created the prompt (references User model)
 *           example: 507f1f77bcf86cd799439011
 *         title:
 *           type: string
 *           minLength: 3
 *           maxLength: 200
 *           description: Prompt title
 *           example: Cyberpunk Cat in Neon City
 *         description:
 *           type: string
 *           maxLength: 1000
 *           description: Optional description of the prompt
 *           example: A beautiful AI-generated image of a cat in a cyberpunk setting
 *         promptText:
 *           type: string
 *           minLength: 10
 *           description: The actual prompt text used to generate the output
 *           example: Create an image of a cyberpunk cat with neon lights
 *         sampleOutput:
 *           type: string
 *           description: URL or text showing the output result (image URL for image type, video/audio URL for media types, or text for text type)
 *           example: https://res.cloudinary.com/dxhkryxzk/image/upload/v1755980278/prompts/example.jpg
 *         mediaType:
 *           type: string
 *           enum: [text, image, video, audio]
 *           default: text
 *           description: Type of media the prompt generates
 *         aiModel:
 *           type: string
 *           maxLength: 100
 *           description: AI model used to generate the output
 *           example: DALL-E 3
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *           maxItems: 10
 *           default: []
 *           description: Array of tags for categorization
 *           example: [art, cyberpunk, cat]
 *         likes:
 *           type: array
 *           items:
 *             type: string
 *           description: Array of user IDs who liked this prompt
 *         views:
 *           type: integer
 *           default: 0
 *           description: Number of times the prompt has been viewed
 *         shares:
 *           type: integer
 *           default: 0
 *           description: Number of times the prompt has been shared
 *         isPublic:
 *           type: boolean
 *           default: true
 *           description: Whether the prompt is publicly visible
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Prompt creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 *         isHidden:
 *           type: boolean
 *           default: false
 *           description: Whether the prompt is hidden from public view
 *         isDeleted:
 *           type: boolean
 *           default: false
 *           description: Whether the prompt is soft-deleted
 *         deletedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp when the prompt was deleted
 *         deletedBy:
 *           type: string
 *           description: Admin user ID who deleted the prompt (references User)
 *         moderationReason:
 *           type: string
 *           enum: [spam, inappropriate, copyright, policy_violation, other]
 *           description: Reason for moderation action
 *         moderationNotes:
 *           type: string
 *           maxLength: 500
 *           description: Additional notes about the moderation action
 *         flaggedCount:
 *           type: integer
 *           default: 0
 *           description: Number of times this prompt has been flagged
 *         lastFlaggedAt:
 *           type: string
 *           format: date-time
 *           description: Timestamp of the most recent flag
 */
import mongoose, { Schema, SchemaDefinition } from 'mongoose';
import { IPromptDocument } from '../types/prompt.types.js';
import { generateUniqueSlug } from '../utils/slug.util.js';
import { extractTemplateVariables } from '../utils/template.util.js';

export const MAX_PROMPT_VERSIONS = 200;
export const MAX_TEST_CASES = 20;

const promptVersionSchema = new Schema(
  {
    versionNumber: { type: Number, required: true },
    promptText: { type: String, required: true },
    templateVariables: [{ type: String }],
    changeSummary: { type: String, trim: true, maxlength: 300, default: '' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const testCaseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    variables: { type: Map, of: String, default: {} },
    expectedAssertions: [{ type: String, trim: true, maxlength: 500 }],
  },
  { _id: true },
);

const promptSchemaDefinition: SchemaDefinition<IPromptDocument> = {
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required.'],
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Title is required.'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters.'],
  },
  // Stable public URL key (/prompts/:slug). Generated once on creation and
  // never changed on title edits, so shared links keep working.
  slug: {
    type: String,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters.'],
  },
  promptText: {
    type: String,
    required: [true, 'Prompt text is required.'],
    trim: true,
  },
  sampleOutput: {
    type: String,
    required: [true, 'Sample output is required.'],
  },
  outputs: [{
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'url'],
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      trim: true,
    },
  }],
  mediaType: {
    type: String,
    enum: {
      values: ['text', 'image', 'video', 'audio'],
      message: 'Media type must be: text, image, video, or audio',
    },
    default: 'text',
  },
  aiModel: {
    type: String,
    required: [true, 'AI model is required.'],
    trim: true,
    maxlength: [100, 'AI model name cannot exceed 100 characters.'],
  },
  tags: {
    type: [String],
    default: [],
    validate: {
      validator: function (tags: string[]) {
        return tags.length <= 10;
      },
      message: 'Cannot have more than 10 tags.',
    },
  },
  likes: [
    {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  // Denormalized likes.length so the feed can sort by popularity server-side.
  likesCount: {
    type: Number,
    default: 0,
  },
  // Version history. `promptText` always mirrors the current version.
  // Owner-only: stripped from JSON (see transform below); read via
  // GET /prompts/:id/versions. Append with $push, never by saving a doc
  // that was loaded without this path.
  currentVersion: {
    type: Number,
    default: 1,
  },
  versions: {
    type: [promptVersionSchema],
    default: undefined,
  },
  // Saved variable sets for template prompts (owner-only, like versions).
  testCases: {
    type: [testCaseSchema],
    default: undefined,
  },
  // Lineage for forks (Phase 2 UI).
  forkedFrom: {
    type: Schema.Types.ObjectId,
    ref: 'Prompt',
    default: null,
  },
  forksCount: {
    type: Number,
    default: 0,
  },
  views: {
    type: Number,
    default: 0,
  },
  shares: {
    type: Number,
    default: 0,
  },
  isPublic: {
    type: Boolean,
    default: true,
  },
  originalPromptText: {
    type: String,
    trim: true,
  },
  isOptimized: {
    type: Boolean,
    default: false,
  },
  optimizationId: {
    type: Schema.Types.ObjectId,
    ref: 'PromptOptimization',
  },
  // Moderation fields
  isHidden: {
    type: Boolean,
    default: false,
    index: true,
  },
  isDeleted: {
    type: Boolean,
    default: false,
    index: true,
  },
  deletedAt: {
    type: Date,
  },
  deletedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
  },
  moderationReason: {
    type: String,
    enum: {
      values: ['spam', 'inappropriate', 'copyright', 'policy_violation', 'other'],
      message:
        'Moderation reason must be: spam, inappropriate, copyright, policy_violation, or other',
    },
  },
  moderationNotes: {
    type: String,
    trim: true,
    maxlength: [500, 'Moderation notes cannot exceed 500 characters.'],
  },
  flaggedCount: {
    type: Number,
    default: 0,
  },
  lastFlaggedAt: {
    type: Date,
  },
};

// Version history and test cases are owner-only data; never serialize them
// with the prompt. Owner endpoints read them from the document directly.
const stripOwnerOnly = (_doc: unknown, ret: Record<string, unknown>) => {
  delete ret.versions;
  delete ret.testCases;
  return ret;
};

const promptSchema = new Schema<IPromptDocument>(promptSchemaDefinition, {
  timestamps: true,
  toJSON: { virtuals: true, transform: stripOwnerOnly },
  toObject: { virtuals: true, transform: stripOwnerOnly },
});

promptSchema.index({ user: 1 });
promptSchema.index({ isPublic: 1, createdAt: -1 });
promptSchema.index({ tags: 1 });
promptSchema.index({ aiModel: 1 });

promptSchema.index({
  title: 'text',
  tags: 'text',
  promptText: 'text',
  description: 'text',
});

promptSchema.index({ isPublic: 1, createdAt: -1, aiModel: 1 });
promptSchema.index({ isPublic: 1, createdAt: -1, tags: 1 });

// Moderation indexes
promptSchema.index({ isHidden: 1, isDeleted: 1, createdAt: -1 });
promptSchema.index({ flaggedCount: -1, lastFlaggedAt: -1 });
promptSchema.index({ deletedBy: 1 });
promptSchema.index({ isPublic: 1, isHidden: 1, isDeleted: 1, createdAt: -1 });
promptSchema.index({ isPublic: 1, isHidden: 1, isDeleted: 1, likesCount: -1 });
promptSchema.index({ isPublic: 1, isHidden: 1, isDeleted: 1, shares: -1 });
// Sparse so documents created before slugs existed don't collide on null.
promptSchema.index({ slug: 1 }, { unique: true, sparse: true });

promptSchema.pre('validate', async function () {
  if (!this.slug && this.title) {
    this.slug = await generateUniqueSlug(this.title, Prompt);
  }
  this.likesCount = this.likes?.length ?? 0;
  if (this.isNew && !this.versions?.length && this.promptText) {
    this.versions = [
      {
        versionNumber: 1,
        promptText: this.promptText,
        templateVariables: extractTemplateVariables(this.promptText),
        changeSummary: 'Initial version',
        createdBy: this.user,
        createdAt: new Date(),
      },
    ] as any;
    this.currentVersion = 1;
  }
});

const Prompt = mongoose.model<IPromptDocument>('Prompt', promptSchema);

export default Prompt;
