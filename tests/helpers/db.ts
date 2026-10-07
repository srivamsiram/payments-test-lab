import { Pool } from 'pg';
import { config } from '../../src/config';

// Deliberately uses raw SQL via `pg`, not Prisma: DB assertions should not
// trust the same ORM mapping that the code under test uses.

export interface PaymentRow {
  id: string;
  user_id: string;
  amount: string;
  currency: string;
  payment_method_token: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

export function createDbPool(): Pool {
  const url = new URL(config.databaseUrl);
  url.searchParams.delete('schema'); // Prisma-only parameter
  return new Pool({ connectionString: url.toString(), max: 2 });
}

export async function findPaymentRow(db: Pool, id: string): Promise<PaymentRow | undefined> {
  const { rows } = await db.query<PaymentRow>(
    `SELECT id, user_id, amount::text AS amount, currency, payment_method_token,
            status::text AS status, created_at, updated_at
       FROM payments
      WHERE id = $1`,
    [id],
  );
  return rows[0];
}

export async function countPaymentsByToken(db: Pool, paymentMethodToken: string): Promise<number> {
  const { rows } = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM payments WHERE payment_method_token = $1',
    [paymentMethodToken],
  );
  return Number(rows[0].count);
}
