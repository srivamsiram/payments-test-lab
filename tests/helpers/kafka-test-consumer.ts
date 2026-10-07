import { randomUUID } from 'node:crypto';
import { Kafka, logLevel, type Consumer, type IHeaders } from 'kafkajs';
import { config } from '../../src/config';

export interface ReceivedMessage {
  topic: string;
  partition: number;
  offset: string;
  key: string | null;
  value: unknown;
  headers: Record<string, string>;
  timestamp: string;
}

type Predicate = (message: ReceivedMessage) => boolean;

interface Waiter {
  predicate: Predicate;
  resolve: (message: ReceivedMessage) => void;
}

/**
 * Test-side Kafka listener.
 *
 * Every instance uses a fresh consumer group, snapshots the topic's end
 * offsets *before* the test acts, and seeks there once partitions are
 * assigned. That way it sees exactly the messages produced after start(),
 * with no race against group-join and no replay of old history.
 */
export class KafkaTestConsumer {
  private readonly kafka: Kafka;
  private readonly consumer: Consumer;
  private readonly received: ReceivedMessage[] = [];
  private readonly seen = new Set<string>();
  private waiters: Waiter[] = [];

  constructor(private readonly topic: string) {
    this.kafka = new Kafka({
      clientId: `kafka-test-consumer-${randomUUID()}`,
      brokers: [...config.kafka.brokers],
      logLevel: logLevel.NOTHING,
    });
    this.consumer = this.kafka.consumer({ groupId: `payments-test-lab-${randomUUID()}` });
  }

  async start(joinTimeoutMs = 20_000): Promise<void> {
    const admin = this.kafka.admin();
    await admin.connect();
    const endOffsets = await admin.fetchTopicOffsets(this.topic);
    await admin.disconnect();

    await this.consumer.connect();

    const joined = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Consumer did not join group within ${joinTimeoutMs}ms`)),
        joinTimeoutMs,
      );
      const removeListener = this.consumer.on(this.consumer.events.GROUP_JOIN, () => {
        clearTimeout(timer);
        removeListener();
        resolve();
      });
    });

    await this.consumer.subscribe({ topic: this.topic, fromBeginning: false });
    await this.consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        this.record({
          topic,
          partition,
          offset: message.offset,
          key: message.key?.toString() ?? null,
          value: message.value ? JSON.parse(message.value.toString()) : null,
          headers: decodeHeaders(message.headers),
          timestamp: message.timestamp,
        });
      },
    });

    await joined;
    for (const { partition, offset } of endOffsets) {
      this.consumer.seek({ topic: this.topic, partition, offset });
    }
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }

  messages(predicate: Predicate = () => true): ReceivedMessage[] {
    return this.received.filter(predicate);
  }

  waitForMessage(predicate: Predicate, timeoutMs = 15_000): Promise<ReceivedMessage> {
    const existing = this.received.find(predicate);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        predicate,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== waiter);
        reject(
          new Error(
            `No matching message on "${this.topic}" within ${timeoutMs}ms ` +
              `(${this.received.length} message(s) received in total)`,
          ),
        );
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  private record(message: ReceivedMessage): void {
    const id = `${message.partition}:${message.offset}`;
    if (this.seen.has(id)) return; // a seek can re-deliver an already-fetched offset
    this.seen.add(id);
    this.received.push(message);

    const matched = this.waiters.filter((w) => w.predicate(message));
    this.waiters = this.waiters.filter((w) => !matched.includes(w));
    matched.forEach((w) => w.resolve(message));
  }
}

function decodeHeaders(headers: IHeaders | undefined): Record<string, string> {
  const decoded: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (value === undefined) continue;
    decoded[name] = Array.isArray(value) ? value.map(String).join(',') : value.toString();
  }
  return decoded;
}
