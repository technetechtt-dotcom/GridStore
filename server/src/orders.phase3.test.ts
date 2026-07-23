import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { initPlatformStore } from './store/index.js';

describe('phase 3 checkout and orders', () => {
  const app = createApp();

  beforeAll(async () => {
    await initPlatformStore();
  });

  async function login(email: string) {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'DemoSeed-ChangeMe1' });
    return (response.body.accessToken || response.body.sessionToken) as string;
  }

  async function activeFixedListing() {
    const listings = await request(app).get('/api/listings?status=active');
    const listing = listings.body.find(
      (item: { saleMode?: string; auctionStatus?: string; inventory?: number }) =>
        item.saleMode !== 'auction' && item.auctionStatus !== 'live' && Number(item.inventory) > 0
    );
    expect(listing).toBeTruthy();
    return listing as { id: string; price: number; inventory: number; title: string };
  }

  it('prices checkout from server listings and ignores client unit prices', async () => {
    const token = await login('buyer@gridstore.local');
    const listing = await activeFixedListing();

    const forged = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '1 Main Road, Cape Town',
        paymentMethod: 'card',
        lines: [
          {
            productId: listing.id,
            quantity: 1,
            title: 'Forged',
            seller: 'Attacker',
            unitPrice: 1,
          },
        ],
      });

    expect(forged.status).toBe(201);
    expect(forged.body.total).toBe(Number(listing.price));
    expect(forged.body.totalCents).toBe(Math.round(Number(listing.price) * 100));
    expect(forged.body.lines[0].title).toBe(listing.title);
  });

  it('deducts inventory, rejects oversell, and is idempotent', async () => {
    const token = await login('buyer@gridstore.local');
    const listing = await activeFixedListing();
    const key = `idem-${Date.now()}`;

    const first = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        deliveryAddress: '2 Main Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing.id, quantity: 1 }],
      });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', key)
      .send({
        deliveryAddress: '2 Main Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing.id, quantity: 1 }],
      });
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);

    const after = await request(app).get('/api/listings?status=active');
    const updated = after.body.find((item: { id: string }) => item.id === listing.id);
    expect(Number(updated.inventory)).toBe(Number(listing.inventory) - 1);

    const oversell = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '3 Main Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: listing.id, quantity: Number(updated.inventory) + 5 }],
      });
    expect(oversell.status).toBe(400);
    expect(String(oversell.body.error)).toMatch(/stock/i);
  });

  it('enforces order state machine and append-only events', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const adminToken = await login('admin@gridstore.local');
    const listing = await activeFixedListing();

    const created = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        deliveryAddress: '4 Main Road, Cape Town',
        paymentMethod: 'manual_eft',
        lines: [{ productId: listing.id, quantity: 1 }],
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe('pending_payment');

    const illegal = await request(app)
      .post(`/api/orders/${created.body.id}/transitions`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ action: 'ship' });
    expect(illegal.status).toBe(400);

    const paid = await request(app)
      .post(`/api/orders/${created.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'confirm_payment' });
    expect(paid.status).toBe(200);
    expect(paid.body.status).toBe('paid');

    const processing = await request(app)
      .post(`/api/orders/${created.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'start_processing' });
    expect(processing.status).toBe(200);

    const shipped = await request(app)
      .post(`/api/orders/${created.body.id}/transitions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'ship', trackingNumber: 'TRACK-123' });
    expect(shipped.status).toBe(200);
    expect(shipped.body.trackingNumber).toBe('TRACK-123');

    const events = await request(app)
      .get(`/api/orders/${created.body.id}/events`)
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(events.status).toBe(200);
    expect(events.body.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects auction listings from checkout', async () => {
    const token = await login('buyer@gridstore.local');
    const listings = await request(app).get('/api/listings?status=active');
    const auction = listings.body.find(
      (item: { saleMode?: string }) => item.saleMode === 'auction'
    );
    expect(auction).toBeTruthy();

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '5 Main Road, Cape Town',
        paymentMethod: 'card',
        lines: [{ productId: auction.id, quantity: 1 }],
      });
    expect(response.status).toBe(400);
    expect(String(response.body.error)).toMatch(/auction/i);
  });
});
