import { randomUUID } from 'node:crypto';
import type { PaymentCreatedEvent, PaymentRecord } from './payment.types';

// The payment method token is deliberately NOT part of the event.
export function buildPaymentCreatedEvent(payment: PaymentRecord): PaymentCreatedEvent {
  return {
    eventId: randomUUID(),
    eventType: 'payment.created',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    data: {
      paymentId: payment.id,
      userId: payment.userId,
      amount: payment.amount,
      currency: payment.currency,
      status: payment.status,
      createdAt: payment.createdAt.toISOString(),
    },
  };
}
