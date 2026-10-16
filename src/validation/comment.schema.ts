import { z } from 'zod';
import mongoose from 'mongoose';
import { trimAndSanitize } from '../utils/sanitize.util.js';


const objectIdSchema = z.string().refine(
  (val) => {
    return mongoose.Types.ObjectId.isValid(val);
  },
  { message: 'Invalid ID format.' },
);

export const createCommentSchema = z.object({
  text: z
    .string()
    .min(1, 'Comment text is required.')
    .max(1000, 'Comment text cannot exceed 1000 characters.')
    .transform(trimAndSanitize),
});

export const createCommentParamsSchema = z.object({
  promptId: objectIdSchema,
});

export const updateCommentSchema = z.object({
  text: z
    .string()
    .min(1, 'Comment text is required.')
    .max(1000, 'Comment text cannot exceed 1000 characters.')
    .transform(trimAndSanitize),
});

export const getCommentSchema = z.object({
  commentId: objectIdSchema,
});

export const getCommentsParamsSchema = z.object({
  promptId: objectIdSchema,
});

export const getCommentsQuerySchema = z.object({
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
});

export const toggleCommentLikeSchema = z.object({
  commentId: objectIdSchema,
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
export type GetCommentParams = z.infer<typeof getCommentSchema>;
export type GetCommentsParams = z.infer<typeof getCommentsParamsSchema>;
export type GetCommentsQuery = z.infer<typeof getCommentsQuerySchema>;
export type ToggleCommentLikeParams = z.infer<typeof toggleCommentLikeSchema>;

