import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { resetAuthSecurityStateForTests } from './lib/authSecurity.js';
import { resetLedgerForTests } from './lib/ledger.js';
import { resetPaymentStoreForTests } from './lib/payments.js';
import { resetPayoutsForTests } from './lib/settlement.js';
import { resetReturnsForTests } from './lib/returns.js';
import { resetShippingForTests } from './lib/shipping.js';
import { resetSandboxCarrierForTests } from './lib/carriers/index.js';
import { resetJobsForTests } from './jobs/queue.js';
import { platformStore } from './store/index.js';
import { EVIDENCE_UPLOAD_DIR } from './lib/uploads.js';

const app = createApp();

async function login(email: string) {
  const res = await request(app).post('/api/auth/login').send({
    email,
    password: 'DemoSeed-ChangeMe1',
  });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

async function paidProcessingOrder(buyerToken: string) {
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
      deliveryAddress: '9 Carrier Lane, Durban',
      paymentMethod: 'card',
      lines: [{ productId: listing!.id, quantity: 1 }],
      idempotencyKey: `p11-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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
  return order.body.id as string;
}

describe('phase 11 shipping sandbox and evidence uploads', () => {
  beforeEach(async () => {
    resetAuthSecurityStateForTests();
    resetLedgerForTests();
    resetPaymentStoreForTests();
    resetPayoutsForTests();
    resetReturnsForTests();
    resetShippingForTests();
    resetSandboxCarrierForTests();
    resetJobsForTests();
    await platformStore.ensureSeeded();
  });

  it('blocks buyers from forging shipping events', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const orderId = await paidProcessingOrder(buyerToken);

    const forged = await request(app)
      .post(`/api/platform/orders/${orderId}/shipping-events`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({ status: 'delivered', trackingNumber: 'FAKE-1' });
    expect(forged.status).toBe(403);
  });

  it('creates sandbox labels when shipping without a tracking number', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const sellerToken = await login('seller@gridstore.local');
    const orderId = await paidProcessingOrder(buyerToken);

    const shipped = await platformStore.transitionOrder(
      { userId: 'user-demo-seller', role: 'seller' },
      orderId,
      'ship'
    );
    expect(shipped.trackingNumber).toMatch(/^GS-SBX-/);

    const events = await request(app)
      .get(`/api/platform/orders/${orderId}/shipping-events`)
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(events.status).toBe(200);
    expect(events.body[0].carrier).toMatch(/Sandbox/i);
    expect(events.body[0].note).toMatch(/label/i);

    const labelMatch = String(events.body[0].note).match(/label-[\w-]+/);
    expect(labelMatch).toBeTruthy();
    const label = await request(app)
      .get(`/api/platform/shipping/labels/${labelMatch![0]}`)
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(label.status).toBe(200);
    expect(label.text).toContain(shipped.trackingNumber);
  });

  it('accepts multipart evidence uploads for returns', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const orderId = await paidProcessingOrder(buyerToken);
    await platformStore.transitionOrder(
      { userId: 'user-demo-seller', role: 'seller' },
      orderId,
      'ship'
    );
    await platformStore.transitionOrder(
      { userId: 'user-demo-seller', role: 'seller' },
      orderId,
      'deliver'
    );

    const tmp = path.join(os.tmpdir(), `gridstore-evid-${Date.now()}.png`);
    // Minimal PNG
    fs.writeFileSync(
      tmp,
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        'base64'
      )
    );

    const upload = await request(app)
      .post('/api/uploads/evidence')
      .set('Authorization', `Bearer ${buyerToken}`)
      .attach('file', tmp);
    expect(upload.status).toBe(201);
    expect(upload.body.url).toMatch(/^\/api\/uploads\/evidence\//);

    const opened = await request(app)
      .post('/api/platform/returns')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        orderId,
        reason: 'Broken on arrival — see attached photo',
        evidenceNote: 'Photo of damage',
        attachmentUrl: upload.body.url,
        attachmentName: upload.body.attachmentName,
        mimeType: upload.body.mimeType,
      });
    expect(opened.status).toBe(201);
    expect(opened.body.evidence?.[0]?.attachmentUrl).toBe(upload.body.url);

    const filename = path.basename(upload.body.url);
    const download = await request(app)
      .get(`/api/uploads/evidence/${filename}`)
      .set('Authorization', `Bearer ${buyerToken}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toMatch(/image\/png/);

    fs.unlinkSync(tmp);
    const stored = path.join(EVIDENCE_UPLOAD_DIR, filename);
    if (fs.existsSync(stored)) fs.unlinkSync(stored);
  });
});
