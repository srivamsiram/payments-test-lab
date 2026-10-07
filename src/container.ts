import { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import { createApp } from './app';
import { config as defaultConfig, type AppConfig } from './config';
import { KafkaProducer } from './kafka/kafka-producer';
import { logger } from './logger';
import { KafkaPaymentEventPublisher } from './payments/kafka-payment-event.publisher';
import { PaymentService } from './payments/payment.service';
import { PrismaPaymentRepository } from './payments/prisma-payment.repository';

export interface Container {
  app: Express;
  prisma: PrismaClient;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/** Composition root: wires real Postgres + Kafka adapters into the app. */
export function createContainer(config: AppConfig = defaultConfig): Container {
  const prisma = new PrismaClient({ datasourceUrl: config.databaseUrl });
  const kafkaProducer = new KafkaProducer({
    clientId: config.kafka.clientId,
    brokers: [...config.kafka.brokers],
  });

  const paymentService = new PaymentService(
    new PrismaPaymentRepository(prisma),
    new KafkaPaymentEventPublisher(kafkaProducer, config.kafka.paymentCreatedTopic),
    logger,
  );

  return {
    app: createApp({ paymentService }),
    prisma,
    async start() {
      await prisma.$connect();
      await kafkaProducer.connect();
    },
    async stop() {
      await kafkaProducer.disconnect();
      await prisma.$disconnect();
    },
  };
}
