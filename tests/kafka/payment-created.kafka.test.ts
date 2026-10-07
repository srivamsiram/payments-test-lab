import request from 'supertest';
import { z } from 'zod';
import { config } from '../../src/config';
import { createContainer, type Container } from '../../src/container';
import { buildPaymentPayload, sleep } from '../helpers/factories';
import { KafkaTestConsumer } from '../helpers/kafka-test-consumer';

/**
 * The event contract as consumers see it. `.strict()` makes the test fail if
 * the producer adds a field nobody agreed on (e.g. leaking the card token).
 */
const paymentCreatedEventSchema = z
  .object({
    eventId: z.string().uuid(),
    eventType: z.literal('payment.created'),
    eventVersion: z.literal(1),
    occurredAt: z.string().datetime(),
    data: z
      .object({
        paymentId: z.string().uuid(),
        userId: z.string().min(1),
        amount: z.string().regex(/^\d+\.\d{2}$/, 'amount must be a 2dp decimal string'),
        currency: z.string().regex(/^[A-Z]{3}$/),
        status: z.literal('PENDING'),
        createdAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

/** Requires: docker compose infra up, topic created, migrations applied. */
describe(`Kafka: ${config.kafka.paymentCreatedTopic} event`, () => {
  const ENDPOINT = '/api/v1/payments';
  let container: Container;
  let consumer: KafkaTestConsumer;

  beforeAll(async () => {
    container = createContainer();
    await container.start();
    consumer = new KafkaTestConsumer(config.kafka.paymentCreatedTopic);
    await consumer.start();
  });

  afterAll(async () => {
    await consumer?.stop();
    await container?.stop();
  });

  it('publishes a schema-valid payment.created event keyed by paymentId', async () => {
    const payload = buildPaymentPayload({ amount: 100.5, currency: 'USD' });

    const { body } = await request(container.app).post(ENDPOINT).send(payload).expect(201);
    const message = await consumer.waitForMessage((m) => m.key === body.paymentId);

    const result = paymentCreatedEventSchema.safeParse(message.value);
    if (!result.success) {
      throw new Error(`Event failed schema validation:\n${JSON.stringify(result.error.issues, null, 2)}`);
    }
    const event = result.data;

    expect(event.data).toEqual({
      paymentId: body.paymentId,
      userId: payload.userId,
      amount: '100.50',
      currency: 'USD',
      status: 'PENDING',
      createdAt: expect.any(String),
    });
    expect(message.headers).toMatchObject({
      'event-id': event.eventId,
      'event-type': 'payment.created',
      'content-type': 'application/json',
    });
  });

  it('never includes the payment method token in the event', async () => {
    const payload = buildPaymentPayload();

    const { body } = await request(container.app).post(ENDPOINT).send(payload).expect(201);
    const message = await consumer.waitForMessage((m) => m.key === body.paymentId);

    expect(JSON.stringify(message.value)).not.toContain(payload.paymentMethodToken);
    expect(JSON.stringify(message.headers)).not.toContain(payload.paymentMethodToken);
  });

  it('emits exactly one event per payment', async () => {
    const { body } = await request(container.app).post(ENDPOINT).send(buildPaymentPayload()).expect(201);
    await consumer.waitForMessage((m) => m.key === body.paymentId);

    await sleep(1_500); // give any duplicate a chance to arrive
    expect(consumer.messages((m) => m.key === body.paymentId)).toHaveLength(1);
  });

  it('emits no event when the request is rejected', async () => {
    const payload = buildPaymentPayload({ amount: -1 });

    await request(container.app).post(ENDPOINT).send(payload).expect(400);

    await sleep(1_500);
    const leaked = consumer.messages(
      (m) => (m.value as { data?: { userId?: string } })?.data?.userId === payload.userId,
    );
    expect(leaked).toHaveLength(0);
  });
});
