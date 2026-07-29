import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { resetAuthSecurityStateForTests } from './lib/authSecurity.js';
import { resetLedgerForTests } from './lib/ledger.js';
import { resetPaymentStoreForTests } from './lib/payments.js';
import { resetPayoutsForTests } from './lib/settlement.js';
import { resetPayoutProfilesForTests } from './lib/sellerPayoutProfile.js';
import { resetReturnsForTests } from './lib/returns.js';
import { resetJobsForTests } from './jobs/queue.js';
import { platformStore } from './store/index.js';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({
    email,
    password: 'DemoSeed-ChangeMe1',
  });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe('phase 9 returns and payout profiles', () => {
  beforeEach(async () => {
    resetAuthSecurityStateForTests();
    resetLedgerForTests();
    resetPaymentStoreForTests();
    resetPayoutsForTests();
    resetPayoutProfilesForTests();
    resetReturnsForTests();
    resetJobsForTests();
    await platformStore.ensureSeeded();
  });

  it('lets sellers save payout bank profiles', async () => {
    const sellerToken = await login('seller@gridstore.local');
    const banks = await request(app)
      .get('/api/platform/payout-profile/banks')
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(banks.status).toBe(200);
    expect(banks.body.length).toBeGreaterThan(0);

    const saved = await request(app)
      .put('/api/platform/payout-profile')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        accountName: 'Demo Seller',
        accountNumber: '1234567890',
        bankCode: banks.body[0].code,
        bankName: banks.body[0].name,
      });
    expect(saved.status).toBe(200);
    expect(saved.body.verified).toBe(true);
    expect(saved.body.accountNumber).toMatch(/\*\*\*\*/);
    expect(saved.body.recipientCode).toBeTruthy();
  });

  it('opens returns inside the window and supports staff approval to refund', async () => {
    const buyerToken = await login('buyer@gridstore.local');
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
        deliveryAddress: '14 Return Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing!.id, quantity: 1 }],
        idempotencyKey: `rma-${Date.now()}`,
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
      { trackingNumber: 'RMA-TRACK-1' }
    );
    await platformStore.transitionOrder(
      { userId: 'user-demo-buyer', role: 'buyer' },
      order.body.id,
      'deliver'
    );

    const opened = await request(app)
      .post('/api/platform/returns')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ orderId: order.body.id, reason: 'Arrived damaged and incomplete' });
    expect(opened.status).toBe(201);
    expect(opened.body.rmaCode).toMatch(/^RMA-/);

    const approved = await request(app)
      .post(`/api/platform/returns/${opened.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' });
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe('approved');

    const refunded = await request(app)
      .post(`/api/platform/returns/${opened.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'refund' });
    expect(refunded.status).toBe(200);
    expect(refunded.body.status).toBe('refunded');
  });
});
