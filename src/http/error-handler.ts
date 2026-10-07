import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { logger } from '../logger';
import { EventPublishError } from '../payments/payment.errors';

interface BodyParserError extends Error {
  type?: string;
  status?: number;
}

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request payload is invalid',
        details: err.issues.map((issue) => ({
          field: issue.path.join('.') || '(root)',
          message: issue.message,
        })),
      },
    });
    return;
  }

  const bodyError = err as BodyParserError;
  if (bodyError.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } });
    return;
  }
  if (bodyError.type === 'entity.too.large') {
    res.status(413).json({ error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    return;
  }

  if (err instanceof EventPublishError) {
    res.status(503).json({
      error: {
        code: 'EVENT_PUBLISH_FAILED',
        message: 'Payment could not be processed, please retry',
        paymentId: err.paymentId,
      },
    });
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};
