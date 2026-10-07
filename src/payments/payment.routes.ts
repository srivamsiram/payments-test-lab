import { Router } from 'express';
import { createPaymentSchema } from './payment.schema';
import type { PaymentService } from './payment.service';

export function createPaymentsRouter(paymentService: PaymentService): Router {
  const router = Router();

  // Express 5 forwards rejected promises (incl. ZodError) to the error handler.
  router.post('/', async (req, res) => {
    const command = createPaymentSchema.parse(req.body);
    const result = await paymentService.createPayment(command);
    res.status(201).location(`${req.baseUrl}/${result.paymentId}`).json(result);
  });

  return router;
}
