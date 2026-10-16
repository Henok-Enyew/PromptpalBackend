/**
 * @swagger
 * components:
 *   schemas:
 *     PromptOptimization:
 *       type: object
 *       required:
 *         - user
 *         - originalPrompt
 *         - targetModel
 *         - mediaType
 *       properties:
 *         _id:
 *           type: string
 *           description: Optimization ID
 *           example: 507f1f77bcf86cd799439011
 *         user:
 *           type: string
 *           description: User ID who requested optimization (references User model)
 *           example: 507f1f77bcf86cd799439011
 *         originalPrompt:
 *           type: string
 *           description: Original user input
 *           example: "create image of cat"
 *         optimizedPrompt:
 *           type: string
 *           description: Optimized version
 *           example: "Create a high-quality, photorealistic image of a cat..."
 *         targetModel:
 *           type: string
 *           description: Target AI model
 *           example: "DALL-E 3"
 *         mediaType:
 *           type: string
 *           enum: [text, image, video, audio]
 *           description: Type of media the prompt generates
 *           example: "image"
 *         optimizationType:
 *           type: string
 *           enum: [quick, premium]
 *           description: Type of optimization performed
 *           example: "premium"
 *         optimizationMode:
 *           type: string
 *           enum: [analyze, build, complete]
 *           description: Current mode of optimization
 *           example: "complete"
 *         questions:
 *           type: array
 *           description: Questions generated for premium optimization
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               question:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [select, select_or_text, textarea]
 *               priority:
 *                 type: string
 *                 enum: [high, medium, low]
 *               answered:
 *                 type: boolean
 *               answer:
 *                 type: object
 *         additionalDetails:
 *           type: string
 *           description: Free-form additional details from user
 *           maxLength: 2000
 *         userAnswers:
 *           type: object
 *           description: User's answers to questions
 *         qualityScore:
 *           type: object
 *           properties:
 *             before:
 *               type: number
 *               minimum: 0
 *               maximum: 100
 *             after:
 *               type: number
 *               minimum: 0
 *               maximum: 100
 *             improvements:
 *               type: array
 *               items:
 *                 type: string
 *             intentPreserved:
 *               type: boolean
 *             intentPreservationScore:
 *               type: number
 *         metadata:
 *           type: object
 *           properties:
 *             wordCount:
 *               type: object
 *               properties:
 *                 before:
 *                   type: number
 *                 after:
 *                   type: number
 *             clarityScore:
 *               type: object
 *             specificityScore:
 *               type: object
 *             structureScore:
 *               type: object
 *             completenessScore:
 *               type: number
 *         analysis:
 *           type: object
 *           properties:
 *             completenessScore:
 *               type: number
 *             missingElements:
 *               type: array
 *               items:
 *                 type: string
 *             grammarFixed:
 *               type: boolean
 *             structureImproved:
 *               type: boolean
 *         status:
 *           type: string
 *           enum: [pending, analyzing, questions_ready, building, completed, failed]
 *           description: Current status of optimization
 *           example: "completed"
 *         error:
 *           type: string
 *           description: Error message if status is failed
 *         feedback:
 *           type: object
 *           properties:
 *             rating:
 *               type: integer
 *               minimum: 1
 *               maximum: 5
 *             wasHelpful:
 *               type: boolean
 *             comments:
 *               type: string
 *             submittedAt:
 *               type: string
 *               format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Optimization creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 */
import mongoose, { Schema, SchemaDefinition } from 'mongoose';
import { IPromptOptimizationDocument } from '../types/promptOptimizer.types.js';

const promptOptimizationSchemaDefinition: any = {
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required.'],
    // Index is defined below as compound index with createdAt
  },
  originalPrompt: {
    type: String,
    required: [true, 'Original prompt is required.'],
    trim: true,
  },
  optimizedPrompt: {
    type: String,
    trim: true,
  },
  targetModel: {
    type: String,
    required: [true, 'Target model is required.'],
    trim: true,
  },
  mediaType: {
    type: String,
    enum: {
      values: ['text', 'image', 'video', 'audio'],
      message: 'Media type must be: text, image, video, or audio',
    },
    required: [true, 'Media type is required.'],
  },
  optimizationType: {
    type: String,
    enum: {
      values: ['quick', 'premium'],
      message: 'Optimization type must be: quick or premium',
    },
    default: 'quick',
  },
  optimizationMode: {
    type: String,
    enum: {
      values: ['analyze', 'build', 'complete'],
      message: 'Optimization mode must be: analyze, build, or complete',
    },
    default: 'complete',
  },
  questions: [
    {
      id: String,
      question: String,
      type: {
        type: String,
        enum: ['select', 'select_or_text', 'textarea'],
      },
      priority: {
        type: String,
        enum: ['high', 'medium', 'low'],
      },
      answered: {
        type: Boolean,
        default: false,
      },
      answer: {
        type: {
          type: String,
          enum: ['option', 'custom', 'default', 'skipped'],
        },
        value: String,
        customText: String,
      },
    },
  ],
  additionalDetails: {
    type: String,
    trim: true,
    maxlength: [2000, 'Additional details cannot exceed 2000 characters.'],
  },
  userAnswers: {
    type: Schema.Types.Mixed,
  },
  qualityScore: {
    before: {
      type: Number,
      min: 0,
      max: 100,
    },
    after: {
      type: Number,
      min: 0,
      max: 100,
    },
    improvements: [String],
    intentPreserved: {
      type: Boolean,
      default: true,
    },
  },
  metadata: {
    wordCount: {
      before: Number,
      after: Number,
    },
    clarityScore: {
      before: Number,
      after: Number,
    },
    specificityScore: {
      before: Number,
      after: Number,
    },
    structureScore: {
      before: Number,
      after: Number,
    },
    completenessScore: Number,
    usedAI: Boolean,
    validationMessage: String,
    model: String,
    costUsd: Number,
  },
  diagnosis: {
    ambiguities: [String],
    roleDefinition: String,
    variables: [String],
    formattingConstraints: [String],
    changes: [String],
  },
  lintChecks: {
    before: [{ _id: false, id: String, label: String, passed: Boolean, hint: String }],
    after: [{ _id: false, id: String, label: String, passed: Boolean, hint: String }],
  },
  intentWarnings: [String],
  analysis: {
    completenessScore: Number,
    missingElements: [String],
    grammarFixed: Boolean,
    structureImproved: Boolean,
  },
  suggestions: [
    {
      type: String,
      section: String,
      original: String,
      suggested: String,
      reason: String,
    },
  ],
  promptContext: {
    useCase: String,
    outputType: String,
    tone: String,
    length: String,
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'analyzing', 'questions_ready', 'building', 'completed', 'failed'],
      message: 'Status must be: pending, analyzing, questions_ready, building, completed, or failed',
    },
    default: 'pending',
  },
  error: {
    type: String,
  },
  feedback: {
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    wasHelpful: {
      type: Boolean,
    },
    comments: {
      type: String,
      maxlength: [500, 'Feedback comments cannot exceed 500 characters.'],
    },
    submittedAt: {
      type: Date,
    },
  },
};

const promptOptimizationSchema = new Schema<IPromptOptimizationDocument>(
  promptOptimizationSchemaDefinition,
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
promptOptimizationSchema.index({ user: 1, createdAt: -1 });
promptOptimizationSchema.index({ targetModel: 1, createdAt: -1 });
promptOptimizationSchema.index({ mediaType: 1 });
promptOptimizationSchema.index({ status: 1 });
promptOptimizationSchema.index({ optimizationType: 1 });

const PromptOptimization = mongoose.model<IPromptOptimizationDocument>(
  'PromptOptimization',
  promptOptimizationSchema,
);

export default PromptOptimization;

