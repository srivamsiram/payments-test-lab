import { randomUUID } from 'node:crypto';
import type { CreatePaymentRequest } from '../../src/payments/payment.schema';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Unique per call, so tests can find "their" rows/events without truncating tables. */
export function buildPaymentPayload(overrides: Partial<CreatePaymentRequest> = {}): CreatePaymentRequest {
  const unique = randomUUID().replace(/-/g, '');
  return {
    userId: `user_${unique.slice(0, 12)}`,
    amount: 100.5,
    currency: 'USD',
    paymentMethodToken: `tok_test_${unique}`,
    ...overrides,
  };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
