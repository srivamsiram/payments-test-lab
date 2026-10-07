import { z } from 'zod';

const hasAtMostTwoDecimals = (value: number): boolean =>
  Math.abs(Math.round(value * 100) - value * 100) < 1e-6;

export const createPaymentSchema = z
  .object({
    userId: z.string().trim().min(1, 'userId is required').max(64),
    amount: z
      .number({ invalid_type_error: 'amount must be a number' })
      .finite()
      .positive('amount must be greater than 0')
      .max(1_000_000, 'amount must not exceed 1,000,000')
      .refine(hasAtMostTwoDecimals, 'amount must have at most 2 decimal places'),
    currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO 4217 code'),
    paymentMethodToken: z
      .string()
      .regex(/^tok_[A-Za-z0-9_]+$/, 'paymentMethodToken must look like tok_xxx'),
  })
  // Reject unknown fields: a payments API should never silently ignore input.
  .strict();

export type CreatePaymentRequest = z.infer<typeof createPaymentSchema>;
