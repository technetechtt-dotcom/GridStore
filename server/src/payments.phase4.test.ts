import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import {
  canonicalizeWebhookPayload,
  getPaymentByOrder,
  resetPaymentStoreForTests,
  signWebhookPayload,
} from './lib/payments.js';
import { accountBalanceCents, resetLedgerForTests, validateLedgerIntegrity } from './lib/ledger.js';
import { initPlatformStore } from './store/index.js';

describe('phase 4 payments and ledger', () => {
  const app = createApp();

  beforeAll(async () => {
    resetPaymentStoreForTests();
    resetLedgerForTests();
    await initPlatformStore();
  });

  async function login(email: string) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'DemoSeed-ChangeMe1' });
    return (response.body.accessToken || response.body.sessionToken) as string;
  }

  async function fixedListing() {
    const listings = await request(app).get('/api/listings?status=active');
    const listing = listings.body.find(
      (item: { saleMode?: string; auctionStatus?: string; inventory?: number }) =>
        item.saleMode !== 'auction' && item.auctionStatus !== 'live' && Number(item.inventory) > 0
    );
    expect(listing).toBeTruthy();
    return listing as { id: string; price: number };
  }

  it('creates sandbox payment intents and marks orders paid only after capture', async () => {
    process.env.PAYMENT_SANDBOX_AUTO_CAPTURE = 'false';
    resetPaymentStoreForTests();
    resetLedgerForTests();

    const token = await login('buyer@gridstore.local');
    const listing = await fixedListing();
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '10 Payment Street, Cape Town',
        paymentMethod: 'manual_eft',
        lines: [{ productId: listing.id, quantity: 1 }],
      });
    expect(order.status).toBe(201);
    expect(order.body.status).toBe('pending_payment');

    const intent = await request(app)
      .post('/api/payments/intents')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.body.id, idempotencyKey: `intent-${Date.now()}` });
    expect(intent.status).toBe(201);
    expect(intent.body.status).toBe('pending');
    expect(intent.body.amountCents).toBe(order.body.totalCents);

    const payload = {
      providerEventId: `evt-test-${Date.now()}`,
      eventType: 'payment.captured' as const,
      reference: intent.body.providerReference,
      amountCents: intent.body.amountCents,
    };
    const rawBody = canonicalizeWebhookPayload(payload);
    const signature = signWebhookPayload(rawBody);

    const bad = await request(app)
      .post('/api/payments/webhooks/sandbox')
      .set('x-gridstore-signature', 'deadbeef')
      .send(payload);
    expect(bad.status).toBe(401);

    const webhook = await request(app)
      .post('/api/payments/webhooks/sandbox')
      .set('x-gridstore-signature', signature)
      .send(payload);
    expect(webhook.status).toBe(201);
    expect(webhook.body.status).toBe('captured');

    const replay = await request(app)
      .post('/api/payments/webhooks/sandbox')
      .set('x-gridstore-signature', signature)
      .send(payload);
    expect(replay.status).toBe(200);
    expect(replay.body.duplicate).toBe(true);

    const paid = await request(app)
      .get(`/api/orders/${order.body.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(paid.body.status).toBe('paid');
    expect(paid.body.paymentStatus).toBe('paid');

    validateLedgerIntegrity();
    expect(accountBalanceCents('cash_provider')).toBe(order.body.totalCents);

    delete process.env.PAYMENT_SANDBOX_AUTO_CAPTURE;
  });

  it('auto-captures card checkout in sandbox and posts balanced ledger entries', async () => {
    delete process.env.PAYMENT_SANDBOX_AUTO_CAPTURE;
    resetPaymentStoreForTests();
    resetLedgerForTests();
    const token = await login('buyer@gridstore.local');
    const listing = await fixedListing();

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '11 Payment Street, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing.id, quantity: 1 }],
      });

    expect(order.status).toBe(201);
    expect(order.body.status).toBe('paid');
    const payment = getPaymentByOrder(order.body.id);
    expect(payment?.status).toBe('captured');
    validateLedgerIntegrity();
    expect(accountBalanceCents('platform_fees')).toBe(Math.round(order.body.totalCents * 0.12));
  });

  it('never stores card numbers and rejects amount mismatches', async () => {
    process.env.PAYMENT_SANDBOX_AUTO_CAPTURE = 'false';
    resetPaymentStoreForTests();

    const token = await login('buyer@gridstore.local');
    const listing = await fixedListing();
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '12 Payment Street, Cape Town',
        paymentMethod: 'manual_eft',
        lines: [{ productId: listing.id, quantity: 1 }],
      });

    const created = await request(app)
      .post('/api/payments/intents')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderId: order.body.id });
    expect(JSON.stringify(created.body)).not.toMatch(/cardNumber|cvv|cvc/i);

    const payload = {
      providerEventId: `evt-mismatch-${Date.now()}`,
      eventType: 'payment.captured' as const,
      reference: created.body.providerReference,
      amountCents: created.body.amountCents + 100,
    };
    const rawBody = canonicalizeWebhookPayload(payload);
    const mismatch = await request(app)
      .post('/api/payments/webhooks/sandbox')
      .set('x-gridstore-signature', signWebhookPayload(rawBody))
      .send(payload);
    expect(mismatch.status).toBe(400);

    delete process.env.PAYMENT_SANDBOX_AUTO_CAPTURE;
  });
});
