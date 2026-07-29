import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { initPlatformStore, platformStore } from './store/index.js';

describe('critical authorization and refund controls', () => {
  const app = createApp();

  beforeAll(async () => {
    await initPlatformStore();
  });

  async function login(email: string) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'DemoSeed-ChangeMe1' });
    return {
      token: (response.body.accessToken || response.body.sessionToken) as string,
      userId: response.body.user.id as string,
    };
  }

  async function fixedListing() {
    const listings = await request(app).get('/api/listings?status=active');
    const listing = listings.body.find(
      (item: { saleMode?: string; auctionStatus?: string; inventory?: number }) =>
        item.saleMode !== 'auction' && item.auctionStatus !== 'live' && Number(item.inventory) > 0
    );
    expect(listing).toBeTruthy();
    return listing as { id: string; price: number; sellerId?: string };
  }

  it('lets buyers request refunds but blocks buyer refund execution', async () => {
    const buyer = await login('buyer@gridstore.local');
    const listing = await fixedListing();
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        deliveryAddress: '1 Authz Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing.id, quantity: 1 }],
      });
    expect(order.status).toBe(201);
    expect(order.body.status).toBe('paid');

    const requested = await request(app)
      .post(`/api/orders/${order.body.id}/refund`)
      .set('Authorization', `Bearer ${buyer.token}`);
    expect(requested.status).toBe(202);
    expect(requested.body.refundRequest).toBe('submitted');
    expect(requested.body.status).toBe('paid');

    const transition = await request(app)
      .post(`/api/orders/${order.body.id}/transitions`)
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({ action: 'refund' });
    expect([400, 403]).toContain(transition.status);
    expect(String(transition.body.error)).toMatch(/admin|support|seller|execution/i);

    const admin = await login('admin@gridstore.local');
    const executed = await request(app)
      .post(`/api/orders/${order.body.id}/refund`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(executed.status).toBe(200);
    expect(executed.body.status).toBe('refunded');
  });

  it('blocks sellers from fulfilling orders that do not contain their listings', async () => {
    const buyer = await login('buyer@gridstore.local');
    const seller = await login('seller@gridstore.local');
    const listing = await fixedListing();

    // Create a second seller account via signup + promote is heavy; instead create an order
    // with the demo seller listing, then attempt fulfilment as a different seller identity
    // by forging role through DB is not allowed — create a listing under seller and ensure
    // a stranger seller cannot ship. Use admin to create a second seller user is complex.
    // Practical check: transition as seller who does not own lines fails when we strip sellerId.
    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyer.token}`)
      .send({
        deliveryAddress: '2 Authz Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing.id, quantity: 1 }],
      });
    expect(order.status).toBe(201);

    // Mutate the live order record so seller ownership checks see a foreign sellerId.
    const live = platformStore.getOrder(buyer.userId, order.body.id);
    expect(live).toBeTruthy();
    live!.lines = live!.lines.map((line) => ({ ...line, sellerId: 'user-not-this-seller' }));

    const ship = await request(app)
      .post(`/api/orders/${order.body.id}/transitions`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ action: 'ship' });
    expect([400, 403]).toContain(ship.status);
    expect(String(ship.body.error)).toMatch(/ownership|authorized|Not allowed/i);

    // Restore ownership and confirm the real seller can process.
    live!.lines = live!.lines.map((line) => ({ ...line, sellerId: 'user-demo-seller' }));
    const processing = await request(app)
      .post(`/api/orders/${order.body.id}/transitions`)
      .set('Authorization', `Bearer ${seller.token}`)
      .send({ action: 'start_processing' });
    expect(processing.status).toBe(200);
    expect(processing.body.status).toBe('processing');
  });
});
