import { logger as rootLogger, type Logger } from '../logger';
import { EventPublishError } from './payment.errors';
import { buildPaymentCreatedEvent } from './payment.events';
import type {
  CreatePaymentCommand,
  PaymentEventPublisher,
  PaymentRepository,
  PaymentResult,
} from './payment.types';

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly publisher: PaymentEventPublisher,
    private readonly logger: Logger = rootLogger,
  ) {}

  /**
   * 1. Persist as PENDING
   * 2. Emit payment-created
   * 3. Mark COMPLETED (simulates a successful synchronous processor)
   *
   * If the event cannot be published the payment is marked FAILED and the
   * caller gets a retryable error, so DB state never claims success that
   * downstream consumers never heard about.
   */
  async createPayment(command: CreatePaymentCommand): Promise<PaymentResult> {
    const pending = await this.repository.create(command);
    const log = this.logger.child({ paymentId: pending.id });
    log.debug('payment persisted as PENDING');

    try {
      await this.publisher.publishPaymentCreated(buildPaymentCreatedEvent(pending));
    } catch (cause) {
      log.error({ err: cause }, 'payment-created publish failed; marking payment FAILED');
      await this.repository.updateStatus(pending.id, 'FAILED');
      throw new EventPublishError(pending.id, cause);
    }

    const completed = await this.repository.updateStatus(pending.id, 'COMPLETED');
    log.info({ status: completed.status }, 'payment completed');

    return {
      paymentId: completed.id,
      status: completed.status,
      amount: Number(completed.amount),
      currency: completed.currency,
    };
  }
}
