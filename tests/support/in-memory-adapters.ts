import { randomUUID } from 'node:crypto';
import type {
  CreatePaymentCommand,
  PaymentCreatedEvent,
  PaymentEventPublisher,
  PaymentRecord,
  PaymentRepository,
  PaymentStatus,
} from '../../src/payments/payment.types';

/** Fake repository so HTTP-boundary tests (Pact provider) need no database. */
export class InMemoryPaymentRepository implements PaymentRepository {
  private readonly payments = new Map<string, PaymentRecord>();

  async create(command: CreatePaymentCommand): Promise<PaymentRecord> {
    const now = new Date();
    const record: PaymentRecord = {
      id: randomUUID(),
      userId: command.userId,
      amount: command.amount.toFixed(2),
      currency: command.currency,
      paymentMethodToken: command.paymentMethodToken,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };
    this.payments.set(record.id, record);
    return { ...record };
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<PaymentRecord> {
    const existing = this.payments.get(id);
    if (!existing) throw new Error(`Payment ${id} not found`);
    const updated = { ...existing, status, updatedAt: new Date() };
    this.payments.set(id, updated);
    return { ...updated };
  }

  all(): PaymentRecord[] {
    return [...this.payments.values()];
  }

  clear(): void {
    this.payments.clear();
  }
}

/** Fake publisher that records events and can be told to fail. */
export class RecordingEventPublisher implements PaymentEventPublisher {
  readonly published: PaymentCreatedEvent[] = [];
  failWith: Error | null = null;

  async publishPaymentCreated(event: PaymentCreatedEvent): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.published.push(event);
  }

  clear(): void {
    this.published.length = 0;
    this.failWith = null;
  }
}
