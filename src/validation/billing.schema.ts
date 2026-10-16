import { z } from 'zod';

export const checkoutSchema = z.object({
  interval: z.enum(['monthly', 'yearly']).default('monthly'),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
