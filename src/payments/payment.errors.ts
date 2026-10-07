export class EventPublishError extends Error {
  constructor(
    readonly paymentId: string,
    cause: unknown,
  ) {
    super(`Failed to publish payment-created event for payment ${paymentId}`, { cause });
    this.name = 'EventPublishError';
  }
}
