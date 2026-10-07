// Domain types and ports. The service depends only on these interfaces;
// Prisma and Kafka adapters implement them, and tests can swap in fakes.

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED';

export interface CreatePaymentCommand {
  userId: string;
  amount: number;
  currency: string;
  paymentMethodToken: string;
}

export interface PaymentRecord {
  id: string;
  userId: string;
  /** Exact decimal string with 2 fraction digits, e.g. "100.50". */
  amount: string;
  currency: string;
  paymentMethodToken: string;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentResult {
  paymentId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
}

export interface PaymentCreatedEvent {
  eventId: string;
  eventType: 'payment.created';
  eventVersion: 1;
  occurredAt: string;
  data: {
    paymentId: string;
    userId: string;
    amount: string;
    currency: string;
    status: PaymentStatus;
    createdAt: string;
  };
}

export interface PaymentRepository {
  create(command: CreatePaymentCommand): Promise<PaymentRecord>;
  updateStatus(id: string, status: PaymentStatus): Promise<PaymentRecord>;
}

export interface PaymentEventPublisher {
  publishPaymentCreated(event: PaymentCreatedEvent): Promise<void>;
}
