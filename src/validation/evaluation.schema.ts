import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z.string().refine((v) => mongoose.Types.ObjectId.isValid(v), { message: 'Invalid ID format.' });
const variableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Variable names must look like {{name}}.');

export const runEvaluationSchema = z.object({
  promptText: z.string().trim().min(1, 'Prompt text is required.').max(10000, 'Prompt text cannot exceed 10,000 characters.'),
  variables: z
    .record(variableName, z.string().max(5000))
    .refine((v) => Object.keys(v).length <= 30, 'At most 30 variables.')
    .default({}),
  models: z
    .array(z.string().regex(/^[a-z]+:[\w.-]+$/, 'Models look like provider:model.'))
    .min(1, 'Choose at least one model.')
    .max(3, 'Choose at most 3 models.'),
  criteria: z.string().trim().max(2000).optional(),
  promptId: objectId.optional(),
  versionNumber: z.number().int().positive().optional(),
});

export const listEvaluationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
  promptId: objectId.optional(),
});

export const evaluationParamsSchema = z.object({ id: objectId });

export type RunEvaluationInput = z.infer<typeof runEvaluationSchema>;
export type ListEvaluationsQuery = z.infer<typeof listEvaluationsQuerySchema>;
