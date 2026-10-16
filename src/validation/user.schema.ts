import { z } from 'zod';
import { sanitizeInput } from '../utils/sanitize.util.js';
import mongoose from 'mongoose';

const capitalize = (val: string) =>
  val
    .trim()
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export const updateMeSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(2, 'First name must be at least 2 characters')
      .max(50, 'First name cannot exceed 50 characters')
      .transform(sanitizeInput)
      .transform(capitalize)
      .optional(),

    lastName: z
      .string()
      .trim()
      .min(2, 'Last name must be at least 2 characters')
      .max(50, 'Last name cannot exceed 50 characters')
      .transform(sanitizeInput)
      .transform(capitalize)
      .optional(),

    phoneNumber: z
      .string()
      .trim()
      .regex(/^[0-9]{7,15}$/, 'Phone number must contain 7-15 digits')
      .optional(),
  })
  .strict();

// Extended type for UpdateProfileInput that includes profileImage (from file upload)
export type UpdateProfileInput = z.infer<typeof updateMeSchema> & {
  profileImage?: string;
};

const objectIdSchema = z.string().refine(
  (val) => {
    return mongoose.Types.ObjectId.isValid(val);
  },
  { message: 'Invalid ID format.' },
);

export const getUserSchema = z.object({
  id: objectIdSchema,
});

export type GetUserParams = z.infer<typeof getUserSchema>;

export const deleteAccountSchema = z.object({
  // Required for email/password accounts; Google-only accounts have none.
  password: z.string().max(200).optional(),
  confirm: z.literal('DELETE', {
    message: 'Type DELETE to confirm account deletion.',
  }),
});

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
