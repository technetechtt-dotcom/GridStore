import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { initPlatformStore } from './store/index.js';
import { initUserFeaturesStore } from './store/userFeatures/index.js';

import { initStoresStore } from './store/stores/index.js';
import { initTradeStore } from './store/trade/index.js';

describe('gridstore api', () => {
  const app = createApp();

  beforeAll(async () => {
    await initPlatformStore();
    await initUserFeaturesStore();
    await initTradeStore();
    await initStoresStore();
  });

  it('returns health status', async () => {
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });

  it('lists products with category filter', async () => {
    const response = await request(app).get('/api/products?category=Electronics');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body.every((item: { category: string }) => item.category === 'Electronics')).toBe(
      true
    );
  });

  it('returns product by id', async () => {
    const list = await request(app).get('/api/products');
    const firstId = list.body[0].id as string;

    const response = await request(app).get(`/api/products/${firstId}`);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(firstId);
  });

  it('returns 404 for unknown product', async () => {
    const response = await request(app).get('/api/products/missing-id');
    expect(response.status).toBe(404);
  });

  it('answers ai assist prompts', async () => {
    const response = await request(app)
      .post('/api/ai/assist')
      .send({ prompt: 'Need solar inverter' });

    expect(response.status).toBe(200);
    expect(response.body.answer).toContain('solar');
  });

  it('logs in demo seller and returns session token', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'seller@gridstore.local', password: 'demo1234', role: 'seller' });

    expect(response.status).toBe(200);
    expect(response.body.user.sessionToken).toBeTruthy();
    expect(response.body.user.role).toBe('seller');
  });

  it('creates order and seller listing for authenticated user', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer@gridstore.local', password: 'demo1234' });
    const token = login.body.user.sessionToken as string;

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '12 Long Street, Cape Town',
        paymentMethod: 'card',
        lines: [
          {
            productId: 'prod-sony-a7iv',
            title: 'Sony Alpha a7 IV',
            seller: 'CameraWorld ZA',
            quantity: 1,
            unitPrice: 45999,
          },
        ],
      });

    expect(order.status).toBe(201);
    expect(order.body.receiptNumber).toMatch(/^GS-/);

    const sellerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'seller@gridstore.local', password: 'demo1234', role: 'seller' });
    const sellerToken = sellerLogin.body.user.sessionToken as string;

    const listing = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({
        title: 'Test Listing',
        category: 'Electronics',
        price: 999,
        inventory: 5,
        description: 'Verified local electronics listing with warranty.',
        location: 'Johannesburg',
      });

    expect(listing.status).toBe(201);
    expect(listing.body.status).toBe('draft');
  });

  it('lists active marketplace listings publicly', async () => {
    const response = await request(app).get('/api/listings?status=active');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.length).toBeGreaterThan(0);
  });

  it('persists cart and booking requests for authenticated user', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer@gridstore.local', password: 'demo1234' });
    const token = login.body.user.sessionToken as string;

    const cart = await request(app)
      .put('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ 'prod-sony-a7iv': 2 });

    expect(cart.status).toBe(200);
    expect(cart.body['prod-sony-a7iv']).toBe(2);

    const booking = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        serviceId: 'svc-photo',
        serviceTitle: 'Photography',
        provider: 'Studio ZA',
        note: 'Need weekend shoot',
      });

    expect(booking.status).toBe(201);
    expect(booking.body.status).toBe('requested');
  });

  it('returns ops stats for admin user', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@gridstore.local', password: 'demo1234', role: 'admin' });

    expect(login.status).toBe(200);
    const token = login.body.user.sessionToken as string;

    const stats = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${token}`);

    expect(stats.status).toBe(200);
    expect(stats.body.totalUsers).toBeGreaterThanOrEqual(3);
    expect(stats.body.totalListings).toBeGreaterThan(0);
  });

  it('supports haggle offers between buyer and seller', async () => {
    const buyerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer@gridstore.local', password: 'demo1234' });
    const sellerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'seller@gridstore.local', password: 'demo1234', role: 'seller' });

    const buyerToken = buyerLogin.body.user.sessionToken as string;
    const sellerToken = sellerLogin.body.user.sessionToken as string;

    const listings = await request(app).get('/api/listings?status=active');
    const haggleListing = listings.body.find(
      (item: { haggleEnabled?: boolean }) => item.haggleEnabled
    );
    expect(haggleListing).toBeTruthy();

    const offer = await request(app)
      .post('/api/offers')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        listingId: haggleListing.id,
        amount: Math.round(haggleListing.price * 0.8),
        message: 'Would you accept this?',
      });

    expect(offer.status).toBe(201);
    expect(offer.body.status).toBe('pending');

    const response = await request(app)
      .patch(`/api/offers/${offer.body.id}/respond`)
      .set('Authorization', `Bearer ${sellerToken}`)
      .send({ action: 'accept' });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('accepted');
  });

  it('supports live auction bidding', async () => {
    const buyerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer@gridstore.local', password: 'demo1234' });
    const buyerToken = buyerLogin.body.user.sessionToken as string;

    const auctions = await request(app).get('/api/auctions');
    expect(auctions.status).toBe(200);
    expect(auctions.body.length).toBeGreaterThan(0);

    const auction = auctions.body[0];
    const minBid = auction.startingBid ?? auction.price;

    const bid = await request(app)
      .post(`/api/auctions/${auction.id}/bids`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ amount: minBid });

    expect(bid.status).toBe(201);
    expect(bid.body.bid.amount).toBe(minBid);
    expect(bid.body.listing.currentBid).toBe(minBid);
  });

  it('creates and lists seller storefronts', async () => {
    const sellerLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: 'seller@gridstore.local', password: 'demo1234', role: 'seller' });
    const token = sellerLogin.body.user.sessionToken as string;

    const created = await request(app)
      .post('/api/stores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'GridStore Test Shop',
        category: 'Electronics',
        location: 'Durban',
        description: 'Verified electronics storefront with local warranty support.',
        supportEmail: 'seller@gridstore.local',
      });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe('GridStore Test Shop');

    const mine = await request(app)
      .get('/api/stores/mine')
      .set('Authorization', `Bearer ${token}`);

    expect(mine.status).toBe(200);
    expect(mine.body.some((store: { id: string }) => store.id === created.body.id)).toBe(true);

    const publicList = await request(app).get('/api/stores');
    expect(publicList.body.some((store: { id: string }) => store.id === created.body.id)).toBe(true);
  });
});
