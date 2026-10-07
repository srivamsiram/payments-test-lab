import { Prisma, type Payment, type PrismaClient } from '@prisma/client';
import type {
  CreatePaymentCommand,
  PaymentRecord,
  PaymentRepository,
  PaymentStatus,
} from './payment.types';

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(command: CreatePaymentCommand): Promise<PaymentRecord> {
    const row = await this.prisma.payment.create({
      data: {
        userId: command.userId,
        // Go through a string so binary floating point never reaches NUMERIC.
        amount: new Prisma.Decimal(command.amount.toFixed(2)),
        currency: command.currency,
        paymentMethodToken: command.paymentMethodToken,
        status: 'PENDING',
      },
    });
    return toRecord(row);
  }

  async updateStatus(id: string, status: PaymentStatus): Promise<PaymentRecord> {
    const row = await this.prisma.payment.update({ where: { id }, data: { status } });
    return toRecord(row);
  }
}

function toRecord(row: Payment): PaymentRecord {
  return {
    id: row.id,
    userId: row.userId,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    paymentMethodToken: row.paymentMethodToken,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
