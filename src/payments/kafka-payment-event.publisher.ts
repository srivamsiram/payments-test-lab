import type { KafkaProducer } from '../kafka/kafka-producer';
import type { PaymentCreatedEvent, PaymentEventPublisher } from './payment.types';

export class KafkaPaymentEventPublisher implements PaymentEventPublisher {
  constructor(
    private readonly producer: KafkaProducer,
    private readonly topic: string,
  ) {}

  async publishPaymentCreated(event: PaymentCreatedEvent): Promise<void> {
    await this.producer.send(this.topic, {
      // Keying by paymentId keeps all events for one payment ordered on one partition.
      key: event.data.paymentId,
      value: event,
      headers: {
        'event-id': event.eventId,
        'event-type': event.eventType,
        'content-type': 'application/json',
      },
    });
  }
}
