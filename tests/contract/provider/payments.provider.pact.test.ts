import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { Verifier, type VerifierOptions } from '@pact-foundation/pact';
import { createApp } from '../../../src/app';
import { logger } from '../../../src/logger';
import { PaymentService } from '../../../src/payments/payment.service';
import { InMemoryPaymentRepository, RecordingEventPublisher } from '../../support/in-memory-adapters';

/**
 * Provider side: replays every interaction in the pact against the real
 * Express app (real routing, validation, serialization and error handling).
 *
 * Postgres and Kafka are swapped for in-memory adapters on purpose: a contract
 * test checks the HTTP boundary only, so it runs in seconds with no infra.
 * Persistence and events have their own layers (tests/api, tests/kafka).
 */
describe('Pact provider: payments-service', () => {
  const repository = new InMemoryPaymentRepository();
  const publisher = new RecordingEventPublisher();
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp({ paymentService: new PaymentService(repository, publisher, logger) });
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('honours every consumer contract', () => {
    const options: VerifierOptions = {
      provider: 'payments-service',
      providerBaseUrl: baseUrl,
      providerVersion: process.env.GIT_COMMIT ?? '1.0.0-local',
      providerVersionBranch: process.env.GIT_BRANCH ?? 'local',
      logLevel: 'warn',
      stateHandlers: {
        'payment processing is available': async () => {
          repository.clear();
          publisher.clear();
        },
      },
    };

    if (process.env.PACT_BROKER_BASE_URL) {
      Object.assign(options, {
        pactBrokerUrl: process.env.PACT_BROKER_BASE_URL,
        pactBrokerToken: process.env.PACT_BROKER_TOKEN,
        consumerVersionSelectors: [{ mainBranch: true }, { deployedOrReleased: true }],
        publishVerificationResult: process.env.CI === 'true',
      });
    } else {
      options.pactUrls = [path.resolve(__dirname, '../../../pacts/checkout-web-payments-service.json')];
    }

    return new Verifier(options).verifyProvider();
  });
});
