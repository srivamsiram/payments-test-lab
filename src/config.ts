import 'dotenv/config';

function list(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// Defaults match docker-compose.yml so the lab runs without a .env file.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgresql://payments:payments@localhost:5432/payments?schema=public',
  kafka: {
    clientId: process.env.KAFKA_CLIENT_ID ?? 'payments-service',
    brokers: list(process.env.KAFKA_BROKERS, 'localhost:9092'),
    paymentCreatedTopic: process.env.PAYMENT_CREATED_TOPIC ?? 'payment-created',
  },
} as const;

export type AppConfig = typeof config;
