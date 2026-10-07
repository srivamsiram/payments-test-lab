import { Kafka, Partitioners, logLevel, type LogEntry, type Producer } from 'kafkajs';
import { logger } from '../logger';

export interface KafkaProducerConfig {
  clientId: string;
  brokers: string[];
}

export interface OutboundMessage {
  key: string;
  value: unknown;
  headers?: Record<string, string>;
}

// Route kafkajs's internal logging through pino.
const kafkaLogCreator = () => (entry: LogEntry) => {
  const { message, ...extra } = entry.log;
  const fields = { namespace: entry.namespace, ...extra };
  switch (entry.level) {
    case logLevel.ERROR:
    case logLevel.NOTHING:
      return logger.error(fields, message);
    case logLevel.WARN:
      return logger.warn(fields, message);
    case logLevel.INFO:
      return logger.info(fields, message);
    default:
      return logger.debug(fields, message);
  }
};

/** Thin, reusable wrapper around a kafkajs producer that sends JSON messages. */
export class KafkaProducer {
  private readonly producer: Producer;
  private connected = false;

  constructor({ clientId, brokers }: KafkaProducerConfig) {
    const kafka = new Kafka({
      clientId,
      brokers,
      logLevel: logLevel.WARN,
      logCreator: kafkaLogCreator,
      retry: { initialRetryTime: 300, retries: 5 },
    });

    this.producer = kafka.producer({
      // Idempotence + acks=all: no duplicates from producer retries, no loss on leader failover.
      idempotent: true,
      maxInFlightRequests: 1,
      allowAutoTopicCreation: false,
      createPartitioner: Partitioners.DefaultPartitioner,
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
  }

  async send(topic: string, message: OutboundMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('KafkaProducer is not connected; call connect() first');
    }
    await this.producer.send({
      topic,
      acks: -1,
      messages: [
        {
          key: message.key,
          value: JSON.stringify(message.value),
          headers: message.headers,
        },
      ],
    });
  }
}
