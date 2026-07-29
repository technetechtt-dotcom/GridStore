import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { resetAuthSecurityStateForTests } from './lib/authSecurity.js';
import { resetLedgerForTests } from './lib/ledger.js';
import { resetPaymentStoreForTests } from './lib/payments.js';
import { resetAuctionResultsForTests } from './lib/auctionSettlement.js';
import { resetDisputesForTests } from './lib/disputes.js';
import { resetPayoutsForTests } from './lib/settlement.js';
import { resetJobsForTests } from './jobs/queue.js';
import { processJobQueue, enqueueRecurringJobs } from './jobs/worker.js';
import { encryptSecret, decryptSecret } from './lib/cryptoSecrets.js';
import { platformStore } from './store/index.js';
import { tradeStore } from './store/trade/index.js';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({
    email,
    password: 'DemoSeed-ChangeMe1',
  });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe('platform completion', () => {
  beforeEach(async () => {
    resetAuthSecurityStateForTests();
    resetLedgerForTests();
    resetPaymentStoreForTests();
    resetAuctionResultsForTests();
    resetDisputesForTests();
    resetPayoutsForTests();
    resetJobsForTests();
    await platformStore.ensureSeeded();
  });

  it('encrypts MFA secrets at rest until confirmation', async () => {
    const encrypted = encryptSecret('plain-secret-value');
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(encrypted)).toBe('plain-secret-value');

    const user = platformStore.getUserByEmail('admin@gridstore.local')!;
    await platformStore.enableMfa(user.id, 'mfa-test-secret');
    const stored = platformStore.getUserById(user.id)!;
    expect(stored.mfaEnabled).toBe(false);
    expect(stored.mfaSecret?.startsWith('enc:v1:')).toBe(true);
  });

  it('settles auction winners into payment obligations', async () => {
    const adminToken = await login('admin@gridstore.local');
    const sellerToken = await login('seller@gridstore.local');
    const buyerToken = await login('buyer@gridstore.local');

    const created = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Settlement Auction',
        category: 'Electronics',
        price: 1000,
        inventory: 1,
        description: 'Auction for settlement.',
        location: 'Cape Town',
        saleMode: 'auction',
        startingBid: 500,
        bidIncrement: 50,
        auctionDurationHours: 1,
      });
    expect(created.status).toBe(201);

    await request(app)
      .patch(`/api/admin/listings/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' });

    await platformStore.updateListingTradeFields(created.body.id, {
      auctionStatus: 'live',
      auctionEndsAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const bid = await request(app)
      .post(`/api/auctions/${created.body.id}/bids`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amount: 750, idempotencyKey: `bid-${Date.now()}` });
    expect(bid.status).toBe(201);

    await platformStore.updateListingTradeFields(created.body.id, {
      auctionEndsAt: new Date(Date.now() - 60_000).toISOString(),
    });

    const closed = await request(app)
      .post('/api/auctions/close-due')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(closed.status).toBe(200);

    const listing = platformStore.getListing(created.body.id);
    expect(listing?.auctionStatus).toBe('ended');
    expect(listing?.auctionWinnerId).toBeTruthy();
    expect(listing?.winningOrderId).toBeTruthy();

    const order = platformStore.getOrder(listing!.auctionWinnerId!, listing!.winningOrderId!);
    expect(order).toBeTruthy();
    expect(['pending_payment', 'paid']).toContain(order?.status);
    expect(order?.totalCents).toBe(75_000);
  });

  it('runs durable background jobs and monitoring endpoints', async () => {
    const adminToken = await login('admin@gridstore.local');
    await enqueueRecurringJobs();
    const processed = await processJobQueue(10);
    expect(processed).toBeGreaterThan(0);

    const monitoring = await request(app)
      .get('/api/platform/monitoring')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(monitoring.status).toBe(200);
    expect(monitoring.body.counts).toBeTruthy();

    const jobs = await request(app)
      .post('/api/platform/jobs/run')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(jobs.status).toBe(200);
    expect(jobs.body.ok).toBe(true);
  });

  it('supports disputes and shipping tracking events', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const sellerToken = await login('seller@gridstore.local');
    const adminToken = await login('admin@gridstore.local');

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
        deliveryAddress: '12 Test Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing!.id, quantity: 1 }],
        idempotencyKey: `disp-${Date.now()}`,
      });
    expect(order.status).toBe(201);

    if (order.body.status === 'pending_payment') {
      await platformStore.transitionOrder(
        { userId: 'system', role: 'system' },
        order.body.id,
        'confirm_payment'
      );
    }

    const dispute = await request(app)
      .post('/api/platform/disputes')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ orderId: order.body.id, reason: 'Item not as described in listing photos' });
    expect(dispute.status).toBe(201);

    const evidence = await request(app)
      .post(`/api/platform/disputes/${dispute.body.id}/evidence`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ note: 'Buyer received correct SKU; attaching packing photo reference.' });
    expect(evidence.status).toBe(200);

    const ship = await request(app)
      .post(`/api/platform/orders/${order.body.id}/shipping-events`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        status: 'in_transit',
        carrier: 'The Courier Guy',
        trackingNumber: 'TCG123456789',
        location: 'Cape Town Hub',
      });
    expect(ship.status).toBe(201);

    const resolve = await request(app)
      .post(`/api/platform/disputes/${dispute.body.id}/resolve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ resolution: 'resolved_seller' });
    expect(resolve.status).toBe(200);
    expect(resolve.body.status).toBe('resolved_seller');
  });
});
