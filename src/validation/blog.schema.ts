import { z } from 'zod';
import mongoose from 'mongoose';
import { trimAndSanitize, trimOnly } from '../utils/sanitize.util.js';


const objectIdSchema = z.string().refine(
  (val) => {
    return mongoose.Types.ObjectId.isValid(val);
  },
  { message: 'Invalid ID format.' },
);

// Prompt Snippet Schema
const promptSnippetSchema = z.object({
  title: z
    .string()
    .min(3, 'Prompt snippet title must be at least 3 characters.')
    .max(200, 'Prompt snippet title cannot exceed 200 characters.')
    .transform(trimAndSanitize)
    .optional()
    .default(''),
  icon: z.string().transform(trimAndSanitize).optional(),
  optimizedFor: z
    .array(z.string().transform(trimAndSanitize))
    .max(10, 'Cannot have more than 10 optimized models.')
    .optional()
    .default([]),
  systemInstruction: z
    .string()
    .max(2000, 'System instruction cannot exceed 2000 characters.')
    .transform(trimOnly)
    .optional(),
  constraints: z
    .array(z.string().transform(trimOnly))
    .max(20, 'Cannot have more than 20 constraints.')
    .optional()
    .default([]),
  examples: z
    .array(z.string().transform(trimOnly))
    .max(10, 'Cannot have more than 10 examples.')
    .optional()
    .default([]),
  additionalContent: z.record(z.string(), z.any()).optional(),
  assets: z
    .number()
    .int()
    .min(0, 'Assets count cannot be negative.')
    .optional()
    .default(0),
  isSecurityVerified: z.boolean().optional().default(false),
  studioLink: z.string().transform(trimAndSanitize).optional(),
  fullPromptText: z
    .string()
    .min(1, 'Full prompt text is required.')
    .max(5000, 'Full prompt text cannot exceed 5000 characters.')
    .transform(trimOnly),
});

// Blog Section Image Schema
const blogSectionImageSchema = z.object({
  url: z.string().url(),
  caption: z
    .string()
    .max(300, 'Image caption cannot exceed 300 characters.')
    .transform(trimAndSanitize)
    .optional()
    .default(''),
  alt: z
    .string()
    .max(200, 'Image alt text cannot exceed 200 characters.')
    .transform(trimAndSanitize)
    .optional()
    .default(''),
});

// Blog Section Schema
const blogSectionSchema = z.object({
  sectionNumber: z
    .number()
    .int()
    .min(1, 'Section number must be at least 1.'),
  title: z
    .string()
    .min(3, 'Section title must be at least 3 characters.')
    .max(200, 'Section title cannot exceed 200 characters.')
    .transform(trimAndSanitize),
  content: z
    .string()
    .min(10, 'Section content must be at least 10 characters.')
    .max(10000, 'Section content cannot exceed 10000 characters.')
    .transform(trimOnly),
  promptSnippet: promptSnippetSchema.optional(),
  image: blogSectionImageSchema.optional(),
  order: z.number().int().min(0, 'Section order cannot be negative.'),
});

// Create Blog Schema
export const createBlogSchema = z.object({
  title: z
    .string()
    .min(10, 'Title must be at least 10 characters.')
    .max(200, 'Title cannot exceed 200 characters.')
    .transform(trimAndSanitize),
  openingQuote: z
    .string()
    .min(10, 'Opening quote must be at least 10 characters.')
    .max(500, 'Opening quote cannot exceed 500 characters.')
    .transform(trimAndSanitize),
  coverImage: z
    .string()
    .url('Cover image must be a valid URL.')
    .transform(trimAndSanitize),
  category: z.enum(['MODELS', 'RESEARCH', 'TECHNIQUES', 'TUTORIALS', 'NEWS', 'CASE_STUDIES'], {
    message: 'Category must be: MODELS, RESEARCH, TECHNIQUES, TUTORIALS, NEWS, or CASE_STUDIES',
  }),
  tags: z
    .array(z.string().transform(trimAndSanitize))
    .max(10, 'Cannot have more than 10 tags.')
    .optional()
    .default([]),
  sections: z
    .array(blogSectionSchema)
    .min(1, 'At least one section is required.')
    .max(20, 'Cannot have more than 20 sections.'),
  status: z.enum(['draft', 'published', 'hidden']).optional().default('draft'),
  upNext: objectIdSchema.optional(),
  authorRole: z
    .string()
    .max(100, 'Author role cannot exceed 100 characters.')
    .transform(trimAndSanitize)
    .optional(),
});

// Update Blog Schema
export const updateBlogSchema = z.object({
  title: z
    .string()
    .min(10, 'Title must be at least 10 characters.')
    .max(200, 'Title cannot exceed 200 characters.')
    .transform(trimAndSanitize)
    .optional(),
  openingQuote: z
    .string()
    .min(10, 'Opening quote must be at least 10 characters.')
    .max(500, 'Opening quote cannot exceed 500 characters.')
    .transform(trimAndSanitize)
    .optional(),
  coverImage: z
    .string()
    .url('Cover image must be a valid URL.')
    .transform(trimAndSanitize)
    .optional(),
  category: z
    .enum(['MODELS', 'RESEARCH', 'TECHNIQUES', 'TUTORIALS', 'NEWS', 'CASE_STUDIES'])
    .optional(),
  tags: z
    .array(z.string().transform(trimAndSanitize))
    .max(10, 'Cannot have more than 10 tags.')
    .optional(),
  sections: z
    .array(blogSectionSchema)
    .min(1, 'At least one section is required.')
    .max(20, 'Cannot have more than 20 sections.')
    .optional(),
  status: z.enum(['draft', 'published', 'hidden']).optional(),
  upNext: objectIdSchema.optional(),
  authorRole: z
    .string()
    .max(100, 'Author role cannot exceed 100 characters.')
    .transform(trimAndSanitize)
    .optional(),
});

// Add Section Schema
export const addSectionSchema = z.object({
  sectionNumber: z
    .number()
    .int()
    .min(1, 'Section number must be at least 1.'),
  title: z
    .string()
    .min(3, 'Section title must be at least 3 characters.')
    .max(200, 'Section title cannot exceed 200 characters.')
    .transform(trimAndSanitize),
  content: z
    .string()
    .min(10, 'Section content must be at least 10 characters.')
    .max(10000, 'Section content cannot exceed 10000 characters.')
    .transform(trimOnly),
  promptSnippet: promptSnippetSchema.optional(),
  image: blogSectionImageSchema.optional(),
  order: z.number().int().min(0, 'Section order cannot be negative.'),
});

// Update Section Schema
export const updateSectionSchema = z.object({
  sectionNumber: z
    .number()
    .int()
    .min(1, 'Section number must be at least 1.')
    .optional(),
  title: z
    .string()
    .min(3, 'Section title must be at least 3 characters.')
    .max(200, 'Section title cannot exceed 200 characters.')
    .transform(trimAndSanitize)
    .optional(),
  content: z
    .string()
    .min(10, 'Section content must be at least 10 characters.')
    .max(10000, 'Section content cannot exceed 10000 characters.')
    .transform(trimOnly)
    .optional(),
  promptSnippet: promptSnippetSchema.optional(),
  image: blogSectionImageSchema.optional(),
  order: z.number().int().min(0, 'Section order cannot be negative.').optional(),
});

// Query Schemas
export const blogQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, 'Page must be a positive integer.')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive())
    .optional(),
  limit: z
    .string()
    .regex(/^\d+$/, 'Limit must be a positive integer.')
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().int().positive().max(50))
    .optional(),
  category: z
    .enum(['MODELS', 'RESEARCH', 'TECHNIQUES', 'TUTORIALS', 'NEWS', 'CASE_STUDIES'])
    .optional(),
  tags: z.string().transform(trimAndSanitize).optional(),
  author: objectIdSchema.optional(),
  search: z.string().transform(trimAndSanitize).optional(),
  sort: z.enum(['latest', 'popular', 'trending']).optional(),
  status: z.enum(['draft', 'published', 'hidden']).optional(),
});

// Reorder Sections Schema
export const reorderSectionsSchema = z.object({
  sectionIds: z
    .array(objectIdSchema)
    .min(1, 'At least one section ID is required.'),
});

// Param Schemas
export const blogIdSchema = z.object({
  id: objectIdSchema,
});

export const slugParamSchema = z.object({
  slug: z
    .string()
    .min(1, 'Slug is required.')
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens.')
    .transform(trimAndSanitize),
});

export const sectionIdSchema = z.object({
  id: objectIdSchema,
  sectionId: objectIdSchema,
});

// Type exports
export type CreateBlogInput = z.infer<typeof createBlogSchema>;
export type UpdateBlogInput = z.infer<typeof updateBlogSchema>;
export type AddSectionInput = z.infer<typeof addSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type BlogQueryParams = z.infer<typeof blogQuerySchema>;
export type ReorderSectionsInput = z.infer<typeof reorderSectionsSchema>;
export type BlogIdParams = z.infer<typeof blogIdSchema>;
export type SlugParams = z.infer<typeof slugParamSchema>;
export type SectionIdParams = z.infer<typeof sectionIdSchema>;

