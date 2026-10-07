import type { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app';
import { createContainer, type Container } from '../../src/container';
import { logger } from '../../src/logger';
import { PaymentService } from '../../src/payments/payment.service';
import { PrismaPaymentRepository } from '../../src/payments/prisma-payment.repository';
import { countPaymentsByToken, createDbPool, findPaymentRow } from '../helpers/db';
import { buildPaymentPayload, UUID_RE } from '../helpers/factories';
import { RecordingEventPublisher } from '../support/in-memory-adapters';

/**
 * Component test: real HTTP stack (in-process via Supertest) + real Postgres +
 * real Kafka. Database state is verified with raw SQL, independent of Prisma.
 *
 * Requires: docker compose infra up and migrations applied.
 */
describe('POST /api/v1/payments (API + DB)', () => {
  const ENDPOINT = '/api/v1/payments';
  let container: Container;
  let db: Pool;

  beforeAll(async () => {
    container = createContainer();
    await container.start();
    db = createDbPool();
  });

  afterAll(async () => {
    await container?.stop();
    await db?.end();
  });

  it('returns 201 and persists a COMPLETED payment that matches the request', async () => {
    const payload = buildPaymentPayload({ amount: 100.5, currency: 'USD' });

    const response = await request(container.app)
      .post(ENDPOINT)
      .send(payload)
      .expect('Content-Type', /application\/json/)
      .expect(201);

    // --- API contract ---
    expect(response.body).toEqual({
      paymentId: expect.stringMatching(UUID_RE),
      status: 'COMPLETED',
      amount: 100.5,
      currency: 'USD',
    });
    const { paymentId } = response.body;
    expect(response.headers.location).toBe(`${ENDPOINT}/${paymentId}`);

    // --- Database state, queried directly ---
    const row = await findPaymentRow(db, paymentId);
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      id: paymentId,
      user_id: payload.userId,
      amount: '100.50', // NUMERIC(12,2): exact, no float drift
      currency: 'USD',
      payment_method_token: payload.paymentMethodToken,
      status: 'COMPLETED',
    });
    expect(row!.updated_at.getTime()).toBeGreaterThanOrEqual(row!.created_at.getTime());
    expect(await countPaymentsByToken(db, payload.paymentMethodToken)).toBe(1);
  });

  it('stores amounts with exactly two decimal places', async () => {
    // 19.99 has no exact binary float representation; the DB must still hold 19.99.
    const payload = buildPaymentPayload({ amount: 19.99, currency: 'EUR' });

    const { body } = await request(container.app).post(ENDPOINT).send(payload).expect(201);

    const row = await findPaymentRow(db, body.paymentId);
    expect(row?.amount).toBe('19.99');
    expect(body.amount).toBe(19.99);
  });

  const invalidCases: Array<[string, Record<string, unknown>, string]> = [
    ['missing userId', { userId: undefined }, 'userId'],
    ['empty userId', { userId: '   ' }, 'userId'],
    ['zero amount', { amount: 0 }, 'amount'],
    ['negative amount', { amount: -10 }, 'amount'],
    ['more than 2 decimals', { amount: 10.555 }, 'amount'],
    ['amount as a string', { amount: '100.50' }, 'amount'],
    ['lower-case currency', { currency: 'usd' }, 'currency'],
    ['4-letter currency', { currency: 'USDT' }, 'currency'],
    ['malformed token', { paymentMethodToken: 'card_4111111111111111' }, 'paymentMethodToken'],
    ['unknown field', { cvv: '123' }, '(root)'],
  ];

  it.each(invalidCases)('rejects %s with 400 and writes nothing', async (_name, overrides, field) => {
    const payload = { ...buildPaymentPayload(), ...overrides };

    const { body } = await request(container.app).post(ENDPOINT).send(payload).expect(400);

    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field })]),
    );
    if (typeof payload.paymentMethodToken === 'string') {
      expect(await countPaymentsByToken(db, payload.paymentMethodToken)).toBe(0);
    }
  });

  it('rejects malformed JSON with 400 INVALID_JSON', async () => {
    const { body } = await request(container.app)
      .post(ENDPOINT)
      .set('Content-Type', 'application/json')
      .send('{"userId": "u1", "amount": ')
      .expect(400);

    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('marks the payment FAILED and returns 503 when the event cannot be published', async () => {
    // Same real DB, but a publisher that fails: proves the failure path is safe.
    const failingPublisher = new RecordingEventPublisher();
    failingPublisher.failWith = new Error('broker unavailable');
    const app = createApp({
      paymentService: new PaymentService(
        new PrismaPaymentRepository(container.prisma),
        failingPublisher,
        logger,
      ),
    });
    const payload = buildPaymentPayload();

    const { body } = await request(app).post(ENDPOINT).send(payload).expect(503);

    expect(body.error).toMatchObject({
      code: 'EVENT_PUBLISH_FAILED',
      paymentId: expect.stringMatching(UUID_RE),
    });
    const row = await findPaymentRow(db, body.error.paymentId);
    expect(row?.status).toBe('FAILED');
  });
});
