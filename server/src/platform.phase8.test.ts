/**
 * Phase 8 completion tests — email drain, payout scheduling, settlement summary.
 */
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { resetAuthSecurityStateForTests } from './lib/authSecurity.js';
import { resetLedgerForTests, postPaymentCaptureJournal } from './lib/ledger.js';
import { resetPaymentStoreForTests } from './lib/payments.js';
import { resetPayoutsForTests, scheduleSellerPayout, processDuePayouts, sellerPayoutSummary } from './lib/settlement.js';
import { resetJobsForTests } from './jobs/queue.js';
import { enqueueRecurringJobs, processJobQueue } from './jobs/worker.js';
import { drainEmailOutbox, resetEmailOutboxForTests, queueTransactionalEmail } from './lib/email.js';
import { platformStore } from './store/index.js';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({
    email,
    password: 'DemoSeed-ChangeMe1',
  });
  expect(res.status).toBe(200);
  return { token: res.body.accessToken as string, userId: res.body.user.id as string };
}

describe('phase 8 email payouts and settlement', () => {
  beforeEach(async () => {
    resetAuthSecurityStateForTests();
    resetLedgerForTests();
    resetPaymentStoreForTests();
    resetPayoutsForTests();
    resetJobsForTests();
    resetEmailOutboxForTests();
    await platformStore.ensureSeeded();
  });

  it('queues transactional email and drains the outbox without a provider', async () => {
    const entry = await queueTransactionalEmail({
      to: 'buyer@gridstore.local',
      subject: 'Test notice',
      body: 'Hello from GridStore',
    });
    expect(entry.status).toBe('queued');
    const result = await drainEmailOutbox();
    expect(result.attempted).toBeGreaterThanOrEqual(1);
    // Without RESEND/webhook the message stays queued (local/dev).
    expect(result.sent).toBe(0);
  });

  it('schedules and processes seller payouts against ledger payable', async () => {
    await postPaymentCaptureJournal({
      orderId: 'ord-test-payout',
      paymentId: 'pay-test-payout',
      amountCents: 100_000,
    });

    const payout = await scheduleSellerPayout({
      sellerId: 'user-demo-seller',
      amountCents: 50_000,
      memo: 'test settlement',
      scheduleAt: new Date(Date.now() - 1000).toISOString(),
    });
    expect(payout.status).toBe('scheduled');

    const paid = await processDuePayouts('system');
    expect(paid.some((item) => item.id === payout.id && item.status === 'paid')).toBe(true);

    const summary = await sellerPayoutSummary('user-demo-seller');
    expect(summary.paidCents).toBeGreaterThanOrEqual(50_000);
  });

  it('exposes seller payout summary and processes payout jobs', async () => {
    const seller = await login('seller@gridstore.local');
    const summary = await request(app)
      .get('/api/platform/payouts/summary')
      .set('Authorization', `Bearer ${seller.token}`);
    expect(summary.status).toBe(200);
    expect(summary.body).toHaveProperty('availableCents');
    expect(summary.body).toHaveProperty('pendingCents');

    await enqueueRecurringJobs();
    const processed = await processJobQueue(20);
    expect(processed).toBeGreaterThan(0);
  });
});
