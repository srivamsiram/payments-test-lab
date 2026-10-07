import path from 'node:path';
import { MatchersV3, PactV3 } from '@pact-foundation/pact';
import { PaymentsApiError, PaymentsClient } from './payments-client';

const { decimal, like, regex, string, uuid } = MatchersV3;

/**
 * Consumer side: "checkout-web" states what it needs from "payments-service".
 * Runs against a Pact mock server (no real service needed) and writes
 * pacts/checkout-web-payments-service.json for the provider to verify.
 */
const pact = new PactV3({
  consumer: 'checkout-web',
  provider: 'payments-service',
  dir: path.resolve(__dirname, '../../../pacts'),
  logLevel: 'warn',
});

const PROVIDER_STATE = 'payment processing is available';

describe('Pact consumer: checkout-web -> payments-service', () => {
  it('creates a payment', () => {
    pact
      .given(PROVIDER_STATE)
      .uponReceiving('a request to create a valid USD payment')
      .withRequest({
        method: 'POST',
        path: '/api/v1/payments',
        headers: { 'Content-Type': 'application/json' },
        body: {
          userId: like('user_42'),
          amount: decimal(100.5),
          currency: regex('^[A-Z]{3}$', 'USD'),
          paymentMethodToken: regex('^tok_[A-Za-z0-9_]+$', 'tok_123'),
        },
      })
      .willRespondWith({
        status: 201,
        headers: { 'Content-Type': 'application/json' },
        body: {
          paymentId: uuid('5b9b3e0e-6a5c-4f7a-9c1b-2d3e4f5a6b7c'),
          status: 'COMPLETED',
          amount: decimal(100.5),
          currency: regex('^[A-Z]{3}$', 'USD'),
        },
      });

    return pact.executeTest(async (mockServer) => {
      const client = new PaymentsClient(mockServer.url);

      const payment = await client.createPayment({
        userId: 'user_42',
        amount: 100.5,
        currency: 'USD',
        paymentMethodToken: 'tok_123',
      });

      expect(payment.status).toBe('COMPLETED');
      expect(payment.paymentId).toMatch(/^[0-9a-f-]{36}$/);
      expect(payment.amount).toBe(100.5);
    });
  });

  it('gets a VALIDATION_ERROR for a negative amount', () => {
    pact
      .given(PROVIDER_STATE)
      .uponReceiving('a request to create a payment with a negative amount')
      .withRequest({
        method: 'POST',
        path: '/api/v1/payments',
        headers: { 'Content-Type': 'application/json' },
        body: {
          userId: 'user_42',
          amount: -5,
          currency: 'USD',
          paymentMethodToken: 'tok_123',
        },
      })
      .willRespondWith({
        status: 400,
        headers: { 'Content-Type': 'application/json' },
        body: {
          error: {
            code: 'VALIDATION_ERROR',
            message: string('Request payload is invalid'),
          },
        },
      });

    return pact.executeTest(async (mockServer) => {
      const client = new PaymentsClient(mockServer.url);

      const attempt = client.createPayment({
        userId: 'user_42',
        amount: -5,
        currency: 'USD',
        paymentMethodToken: 'tok_123',
      });

      await expect(attempt).rejects.toBeInstanceOf(PaymentsApiError);
      await expect(attempt).rejects.toMatchObject({ status: 400, code: 'VALIDATION_ERROR' });
    });
  });
});
