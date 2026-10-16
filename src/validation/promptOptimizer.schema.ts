import { z } from 'zod';
import mongoose from 'mongoose';
import { trimAndSanitize, trimOnly } from '../utils/sanitize.util.js';


const objectIdSchema = z.string().refine(
  (val) => {
    return mongoose.Types.ObjectId.isValid(val);
  },
  { message: 'Invalid ID format.' },
);

// Quick Optimize Schema
export const quickOptimizeSchema = z.object({
  originalPrompt: z
    .string()
    .min(1, 'Prompt cannot be empty.')
    .max(5000, 'Prompt cannot exceed 5000 characters.')
    .transform(trimOnly),
  targetModel: z
    .string()
    .min(1, 'Target model is required.')
    .max(100, 'Target model name cannot exceed 100 characters.')
    .transform(trimAndSanitize),
  mediaType: z.enum(['text', 'image', 'video', 'audio']),
});

// Analyze Prompt Schema
export const analyzePromptSchema = z.object({
  originalPrompt: z
    .string()
    .min(5, 'Prompt must be at least 5 characters.')
    .max(5000, 'Prompt cannot exceed 5000 characters.')
    .transform(trimOnly),
  targetModel: z
    .string()
    .min(1, 'Target model is required.')
    .max(100, 'Target model name cannot exceed 100 characters.')
    .transform(trimAndSanitize),
  mediaType: z.enum(['text', 'image', 'video', 'audio']),
});

// Question Answer Schema
export const questionAnswerSchema = z.object({
  type: z.enum(['option', 'custom', 'default', 'skipped']),
  value: z.string(),
  customText: z.string().optional(),
});

// Build Prompt Schema
export const buildPromptSchema = z.object({
  originalPrompt: z
    .string()
    .min(5, 'Prompt must be at least 5 characters.')
    .max(5000, 'Prompt cannot exceed 5000 characters.')
    .transform(trimOnly),
  targetModel: z
    .string()
    .min(1, 'Target model is required.')
    .max(100, 'Target model name cannot exceed 100 characters.')
    .transform(trimAndSanitize),
  mediaType: z.enum(['text', 'image', 'video', 'audio']),
  answers: z.record(z.string(), questionAnswerSchema).optional(),
  additionalDetails: z
    .string()
    .max(2000, 'Additional details cannot exceed 2000 characters.')
    .transform(trimOnly)
    .optional(),
});

// Get Optimization Schema
export const getOptimizationSchema = z.object({
  id: objectIdSchema,
});

// History Query Schema
export const optimizationHistorySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'Page must be a positive integer.')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive())
    .optional()
    .default(1),
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer.')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(100))
    .optional()
    .default(20),
  targetModel: z.string().transform(trimAndSanitize).optional(),
  optimizationType: z.enum(['quick', 'premium']).optional(),
});

// Apply Optimization Schema
export const applyOptimizationSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters.')
    .max(200, 'Title cannot exceed 200 characters.')
    .transform(trimAndSanitize),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters.')
    .transform(trimAndSanitize)
    .optional(),
  tags: z
    .array(z.string().transform(trimAndSanitize))
    .max(10, 'Cannot have more than 10 tags.')
    .optional()
    .default([]),
  isPublic: z
    .preprocess(
      (val) => {
        if (val === undefined || val === null) {
          return false; // Saved privately unless the user publishes
        }
        if (typeof val === 'string') {
          const lowerVal = val.toLowerCase().trim();
          return lowerVal === 'true' || lowerVal === '1';
        }
        if (typeof val === 'boolean') {
          return val;
        }
        return false;
      },
      z.boolean()
    )
    .optional()
    .default(false),
  sampleOutput: z
    .string()
    .min(1, 'Sample output is required.')
    .optional(),
  outputs: z.preprocess(
    (val) => {
      // Handle FormData array notation or already parsed arrays
      if (!val) return undefined;
      if (Array.isArray(val)) {
        // Filter out undefined/null entries
        return val.filter(o => o && typeof o === 'object');
      }
      if (typeof val === 'object') {
        // Convert object with numeric keys to array
        const valObj = val as Record<string, any>;
        const keys = Object.keys(valObj).sort((a, b) => parseInt(a) - parseInt(b));
        const arr: any[] = [];
        keys.forEach(key => {
          const index = parseInt(key);
          if (!isNaN(index) && valObj[key] && typeof valObj[key] === 'object') {
            arr[index] = valObj[key];
          }
        });
        return arr.filter(o => o !== undefined);
      }
      return undefined;
    },
    z.array(z.discriminatedUnion('type', [
      z.object({
        type: z.literal('image'),
        content: z.string(), // Can be empty for image (file uploaded separately)
        title: z.string().optional(),
      }),
      z.object({
        type: z.enum(['text', 'video', 'audio', 'url']),
        content: z.string().min(1, 'Output content is required.'),
        title: z.string().optional(),
      }),
    ])).optional()
  ),
});

// Feedback Schema
export const feedbackSchema = z.object({
  rating: z
    .number()
    .int()
    .min(1, 'Rating must be at least 1.')
    .max(5, 'Rating cannot exceed 5.'),
  wasHelpful: z.boolean(),
  comments: z
    .string()
    .max(500, 'Comments cannot exceed 500 characters.')
    .transform(trimAndSanitize)
    .optional(),
});

// Type exports
export type QuickOptimizeInput = z.infer<typeof quickOptimizeSchema>;
export type AnalyzePromptInput = z.infer<typeof analyzePromptSchema>;
export type BuildPromptInput = z.infer<typeof buildPromptSchema>;
export type GetOptimizationParams = z.infer<typeof getOptimizationSchema>;
export type OptimizationHistoryParams = z.infer<typeof optimizationHistorySchema>;
export type QuestionAnswerInput = z.infer<typeof questionAnswerSchema>;
export type ApplyOptimizationInput = z.infer<typeof applyOptimizationSchema>;
export type FeedbackInput = z.infer<typeof feedbackSchema>;
