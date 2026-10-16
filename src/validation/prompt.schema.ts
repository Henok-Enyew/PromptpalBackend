import { z } from 'zod';
import mongoose from 'mongoose';
import { trimAndSanitize, trimOnly } from '../utils/sanitize.util.js';


const objectIdSchema = z.string().refine(
  (val) => {
    return mongoose.Types.ObjectId.isValid(val);
  },
  { message: 'Invalid ID format.' },
);

export const createPromptSchema = z.object({
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
  promptText: z
    .string()
    .min(10, 'Prompt text must be at least 10 characters.')
    .max(10000, 'Prompt text cannot exceed 10,000 characters.')
    .transform(trimOnly),
  sampleOutput: z.string().min(1, 'Sample output is required.').optional(),
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
  mediaType: z.enum(['text', 'image', 'video', 'audio']),
  aiModel: z
    .string()
    .min(1, 'AI model is required.')
    .max(100, 'AI model name cannot exceed 100 characters.')
    .transform(trimAndSanitize),
  tags: z
    .array(z.string().transform(trimAndSanitize))
    .max(10, 'Cannot have more than 10 tags.')
    .optional()
    .default([]),
  isPublic: z
    .preprocess(
      (val) => {
        if (val === undefined || val === null) {
          return true; // Default to true
        }
        if (typeof val === 'string') {
          const lowerVal = val.toLowerCase().trim();
          return lowerVal === 'true' || lowerVal === '1';
        }
        if (typeof val === 'boolean') {
          return val;
        }
        return true; // Default fallback
      },
      z.boolean()
    )
    .optional()
    .default(true),
});

export const updatePromptSchema = z.object({
  title: z
    .string()
    .min(3, 'Title must be at least 3 characters.')
    .max(200, 'Title cannot exceed 200 characters.')
    .transform(trimAndSanitize)
    .optional(),
  description: z
    .string()
    .max(1000, 'Description cannot exceed 1000 characters.')
    .transform(trimAndSanitize)
    .optional(),
  promptText: z
    .string()
    .min(10, 'Prompt text must be at least 10 characters.')
    .max(10000, 'Prompt text cannot exceed 10,000 characters.')
    .transform(trimOnly)
    .optional(),
  sampleOutput: z.string().min(1, 'Sample output is required.').optional(),
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
  mediaType: z.enum(['text', 'image', 'video', 'audio']).optional(),
  aiModel: z
    .string()
    .min(1, 'AI model is required.')
    .max(100, 'AI model name cannot exceed 100 characters.')
    .transform(trimAndSanitize)
    .optional(),
  tags: z
    .array(z.string().transform(trimAndSanitize))
    .max(10, 'Cannot have more than 10 tags.')
    .optional(),
  isPublic: z
    .preprocess(
      (val) => {
        if (val === undefined || val === null) {
          return undefined; // Keep as undefined for optional field
        }
        if (typeof val === 'string') {
          const lowerVal = val.toLowerCase().trim();
          return lowerVal === 'true' || lowerVal === '1';
        }
        if (typeof val === 'boolean') {
          return val;
        }
        return undefined; // Default fallback for optional field
      },
      z.boolean()
    )
    .optional(),
});

export const feedQuerySchema = z.object({
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
  tag: z.string().transform(trimAndSanitize).optional(),
  aiModel: z.string().transform(trimAndSanitize).optional(),
  search: z.string().max(200).transform(trimAndSanitize).optional(),
  sort: z.enum(['newest', 'likes', 'shares']).optional().default('newest'),
});

export const getPromptBySlugSchema = z.object({
  slug: z
    .string()
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'Invalid prompt slug.'),
});

export const getPromptSchema = z.object({
  id: objectIdSchema,
});

export const createVersionSchema = z.object({
  promptText: z
    .string()
    .trim()
    .min(10, 'Prompt text must be at least 10 characters.')
    .max(10000, 'Prompt text cannot exceed 10,000 characters.'),
  changeSummary: z.string().trim().max(300).optional(),
});

export const versionParamsSchema = z.object({
  id: objectIdSchema,
  versionNumber: z.coerce.number().int().positive(),
});

const variableName = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Variable names must look like {{name}}.');

export const replaceTestCasesSchema = z.object({
  testCases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(100),
        variables: z
          .record(variableName, z.string().max(5000))
          .refine((v) => Object.keys(v).length <= 30, 'At most 30 variables per test case.'),
        expectedAssertions: z.array(z.string().trim().min(1).max(500)).max(10).optional(),
      }),
    )
    .max(20, 'A prompt can have at most 20 test cases.'),
});

export type CreateVersionInput = z.infer<typeof createVersionSchema>;
export type VersionParams = z.infer<typeof versionParamsSchema>;
export type ReplaceTestCasesInput = z.infer<typeof replaceTestCasesSchema>;

export type CreatePromptInput = z.infer<typeof createPromptSchema>;
export type UpdatePromptInput = z.infer<typeof updatePromptSchema>;
export type FeedQueryParams = z.infer<typeof feedQuerySchema>;
export type GetPromptParams = z.infer<typeof getPromptSchema>;
export type GetPromptBySlugParams = z.infer<typeof getPromptBySlugSchema>;
