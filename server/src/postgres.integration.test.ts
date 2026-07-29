import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './db/migrate.js';
import { hasDatabase, requireSql } from './db/client.js';
import { enqueueJob, claimPendingJobs, completeJob, resetJobsForTests } from './jobs/queue.js';
import { createId } from './lib/ids.js';

const runPg = Boolean(process.env.DATABASE_URL) && process.env.RUN_PG_INTEGRATION === 'true';

describe.skipIf(!runPg)('postgres concurrency integration', () => {
  beforeAll(async () => {
    await migrate();
    resetJobsForTests();
  });

  it('claims jobs with SKIP LOCKED semantics under concurrent workers', async () => {
    expect(hasDatabase()).toBe(true);
    await Promise.all([
      enqueueJob('monitoring.scan', { n: 1 }),
      enqueueJob('monitoring.scan', { n: 2 }),
      enqueueJob('monitoring.scan', { n: 3 }),
      enqueueJob('monitoring.scan', { n: 4 }),
    ]);

    const [batchA, batchB] = await Promise.all([claimPendingJobs(2), claimPendingJobs(2)]);
    const ids = [...batchA, ...batchB].map((job) => job.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    for (const job of [...batchA, ...batchB]) {
      await completeJob(job.id);
    }
  });

  it('rejects duplicate webhook event ids at the database unique constraint', async () => {
    expect(hasDatabase()).toBe(true);
    const db = requireSql();
    const userId = createId('user');
    const orderId = createId('ord');
    const paymentId = createId('pay');
    const webhookId = createId('pwh');
    const eventId = `evt_${Date.now()}`;

    await db`
      INSERT INTO gridstore_users (id, name, email, role, verified, password_hash)
      VALUES (${userId}, 'PG Buyer', ${`${userId}@example.com`}, 'buyer', true, '')
    `;
    await db`
      INSERT INTO gridstore_orders (
        id, user_id, status, payment_status, total, total_cents, delivery_address, receipt_number
      ) VALUES (
        ${orderId}, ${userId}, 'pending_payment', 'requires_provider', 100, 10000,
        'Test address', ${`GS-${Date.now()}`}
      )
    `;
    await db`
      INSERT INTO gridstore_payments (
        id, order_id, user_id, provider, provider_reference, amount_cents, currency, status
      ) VALUES (
        ${paymentId}, ${orderId}, ${userId}, 'sandbox', ${`ref_${paymentId}`}, 10000, 'ZAR', 'pending'
      )
    `;
    await db`
      INSERT INTO gridstore_payment_webhooks (
        id, provider, event_type, provider_event_id, payment_id, payload_hash
      ) VALUES (
        ${webhookId}, 'sandbox', 'payment.captured', ${eventId}, ${paymentId}, 'hash'
      )
    `;

    let duplicateBlocked = false;
    try {
      await db`
        INSERT INTO gridstore_payment_webhooks (
          id, provider, event_type, provider_event_id, payment_id, payload_hash
        ) VALUES (
          ${createId('pwh')}, 'sandbox', 'payment.captured', ${eventId}, ${paymentId}, 'hash2'
        )
      `;
    } catch {
      duplicateBlocked = true;
    }
    expect(duplicateBlocked).toBe(true);
  });
});
