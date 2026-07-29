import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { resetAuthSecurityStateForTests } from './lib/authSecurity.js';
import { resetLedgerForTests } from './lib/ledger.js';
import { resetPaymentStoreForTests } from './lib/payments.js';
import { resetPayoutsForTests, processDuePayouts, scheduleSellerPayout } from './lib/settlement.js';
import { resetPayoutProfilesForTests } from './lib/sellerPayoutProfile.js';
import { resetReturnsForTests } from './lib/returns.js';
import { resetShippingForTests } from './lib/shipping.js';
import { resetDisputesForTests } from './lib/disputes.js';
import { resetEmailOutboxForTests, listEmailOutboxEntries } from './lib/email.js';
import { resetJobsForTests } from './jobs/queue.js';
import { platformStore } from './store/index.js';
import { userFeaturesStore } from './store/userFeatures/index.js';
import { postJournal } from './lib/ledger.js';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({
    email,
    password: 'DemoSeed-ChangeMe1',
  });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function paidDeliveredOrder(buyerToken: string) {
  const listing = platformStore
    .listPublicListings()
    .find(
      (item) =>
        item.saleMode !== 'auction' && item.auctionStatus !== 'live' && Number(item.inventory) > 0
    );
  expect(listing).toBeTruthy();

  const order = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${buyerToken}`)
    .send({
      deliveryAddress: '22 Phase Ten Rd, Johannesburg',
      paymentMethod: 'card',
      lines: [{ productId: listing!.id, quantity: 1 }],
      idempotencyKey: `p10-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    });
  expect(order.status).toBe(201);

  if (order.body.status === 'pending_payment') {
    await platformStore.transitionOrder(
      { userId: 'system', role: 'system' },
      order.body.id,
      'confirm_payment'
    );
  }
  await platformStore.transitionOrder(
    { userId: 'user-demo-seller', role: 'seller' },
    order.body.id,
    'start_processing'
  );
  await platformStore.transitionOrder(
    { userId: 'user-demo-seller', role: 'seller' },
    order.body.id,
    'ship',
    { trackingNumber: `TRK-P10-${Date.now()}` }
  );
  await platformStore.transitionOrder(
    { userId: 'user-demo-seller', role: 'seller' },
    order.body.id,
    'deliver'
  );
  return order.body.id as string;
}

describe('phase 10 platform polish', () => {
  beforeEach(async () => {
    resetAuthSecurityStateForTests();
    resetLedgerForTests();
    resetPaymentStoreForTests();
    resetPayoutsForTests();
    resetPayoutProfilesForTests();
    resetReturnsForTests();
    resetShippingForTests();
    resetDisputesForTests();
    resetEmailOutboxForTests();
    resetJobsForTests();
    await platformStore.ensureSeeded();
  });

  it('tracks shipments by tracking number and notifies the buyer', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const sellerToken = await login('seller@gridstore.local');
    const orderId = await paidDeliveredOrder(buyerToken);

    const event = await request(app)
      .post(`/api/platform/orders/${orderId}/shipping-events`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        status: 'in_transit',
        carrier: 'The Courier Guy',
        trackingNumber: 'TRK-LIVE-100',
        location: 'Johannesburg hub',
      });
    expect(event.status).toBe(201);

    const track = await request(app)
      .get('/api/platform/shipping/track')
      .query({ trackingNumber: 'TRK-LIVE-100' })
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(track.status).toBe(200);
    expect(track.body.orderId).toBe(orderId);
    expect(track.body.events.length).toBeGreaterThan(0);

    const notifications = await userFeaturesStore.listNotifications('user-demo-buyer');
    expect(notifications.some((item) => /Shipment/i.test(item.title))).toBe(true);
    expect(listEmailOutboxEntries().some((item) => /Shipping update/i.test(item.subject))).toBe(true);
  });

  it('accepts return evidence attachments and notifies on open', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const orderId = await paidDeliveredOrder(buyerToken);

    const opened = await request(app)
      .post('/api/platform/returns')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        orderId,
        reason: 'Item arrived damaged and packaging was torn',
        evidenceNote: 'Photo of damaged box',
        attachmentUrl: 'https://cdn.example.com/rma/box.jpg',
        attachmentName: 'box.jpg',
        mimeType: 'image/jpeg',
      });
    expect(opened.status).toBe(201);
    expect(opened.body.rmaCode).toMatch(/^RMA-/);
    expect(opened.body.evidence?.length).toBe(1);
    expect(opened.body.evidence[0].attachmentUrl).toContain('cdn.example.com');

    const notifications = await userFeaturesStore.listNotifications('user-demo-buyer');
    expect(notifications.some((item) => /Return request opened/i.test(item.title))).toBe(true);
  });

  it('lists buyer payments without inventing wallet balances', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    await paidDeliveredOrder(buyerToken);

    const payments = await request(app)
      .get('/api/payments')
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(payments.status).toBe(200);
    expect(Array.isArray(payments.body)).toBe(true);
    expect(payments.body.length).toBeGreaterThan(0);
    expect(payments.body[0].userId).toBe('user-demo-buyer');
  });

  it('still auto-marks sandbox payouts paid outside production', async () => {
    await postJournal({
      type: 'test_seed',
      createdBy: 'system',
      lines: [
        { account: 'cash_provider', direction: 'debit', amountCents: 50_000, memo: 'seed' },
        { account: 'seller_payable', direction: 'credit', amountCents: 50_000, memo: 'seed' },
      ],
    });
    const payout = await scheduleSellerPayout({
      sellerId: 'user-demo-seller',
      amountCents: 10_000,
      scheduleAt: new Date(Date.now() - 1000).toISOString(),
      memo: 'phase10 sandbox payout',
    });
    const paid = await processDuePayouts('system');
    expect(paid.some((item) => item.id === payout.id && item.status === 'paid')).toBe(true);
  });
});
