import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './http/error-handler';
import { createPaymentsRouter } from './payments/payment.routes';
import type { PaymentService } from './payments/payment.service';

export interface AppDependencies {
  paymentService: PaymentService;
}

/** Pure HTTP wiring. No I/O happens here, so tests can inject any dependencies. */
export function createApp({ paymentService }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '10kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/payments', createPaymentsRouter(paymentService));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
