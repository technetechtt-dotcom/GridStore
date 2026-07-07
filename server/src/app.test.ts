import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { initPlatformStore } from './store/index.js';

describe('gridstore api', () => {
  const app = createApp();

  beforeAll(async () => {
    await initPlatformStore();
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
});
