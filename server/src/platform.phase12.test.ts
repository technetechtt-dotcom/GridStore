import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { resetAuthSecurityStateForTests } from './lib/authSecurity.js';
import { resetLedgerForTests } from './lib/ledger.js';
import { resetPaymentStoreForTests } from './lib/payments.js';
import { resetPlatformSettingsForTests } from './lib/platformSettings.js';
import { resetSecurityEventsForTests, recordSecurityEvent, listSecurityEvents } from './lib/security.js';
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

describe('phase 12 settings, uploads, and verification', () => {
  beforeEach(async () => {
    resetAuthSecurityStateForTests();
    resetLedgerForTests();
    resetPaymentStoreForTests();
    resetPlatformSettingsForTests();
    resetSecurityEventsForTests();
    await platformStore.ensureSeeded();
  });

  it('persists admin feature flag toggles in memory mode', async () => {
    const adminToken = await login('admin@gridstore.local');
    const before = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(before.status).toBe(200);
    expect(before.body.features.some((item: { key: string }) => item.key === 'ai_assistant')).toBe(
      true
    );

    const patched = await request(app)
      .patch('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ features: [{ key: 'ai_assistant', enabled: false }] });
    expect(patched.status).toBe(200);
    expect(
      patched.body.features.find((item: { key: string }) => item.key === 'ai_assistant').enabled
    ).toBe(false);

    const after = await request(app)
      .get('/api/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(
      after.body.features.find((item: { key: string }) => item.key === 'ai_assistant').enabled
    ).toBe(false);
  });

  it('blocks unverified buyers from checkout when the flag is on', async () => {
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Unverified Buyer',
      email: `unverified-${Date.now()}@example.com`,
      password: 'SecurePass1x',
    });
    expect(signup.status).toBe(201);
    const token = signup.body.accessToken as string;

    const listing = platformStore.listPublicListings().find((item) => Number(item.inventory) > 0);
    expect(listing).toBeTruthy();

    const order = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deliveryAddress: '1 Verify Street',
        paymentMethod: 'card',
        lines: [{ productId: listing!.id, quantity: 1 }],
        idempotencyKey: `verify-${Date.now()}`,
      });
    expect(order.status).toBe(403);
    expect(order.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
  });

  it('uploads CV files and lists employer applications', async () => {
    const buyerToken = await login('buyer@gridstore.local');
    const sellerToken = await login('seller@gridstore.local');

    const tmp = path.join(os.tmpdir(), `gridstore-cv-${Date.now()}.pdf`);
    fs.writeFileSync(tmp, Buffer.from('%PDF-1.4 demo cv'));

    const upload = await request(app)
      .post('/api/uploads/cv')
      .set('Authorization', `Bearer ${buyerToken}`)
      .attach('file', tmp);
    expect(upload.status).toBe(201);
    expect(upload.body.url).toMatch(/^\/api\/uploads\/cv\//);

    const applied = await request(app)
      .post('/api/applications')
      .set('Authorization', `Bearer ${buyerToken}`)
      .send({
        jobId: 'job-demo-1',
        jobTitle: 'Warehouse Associate',
        cvFileName: upload.body.attachmentName,
        cvUrl: upload.body.url,
      });
    expect(applied.status).toBe(201);
    expect(applied.body.cvUrl).toBe(upload.body.url);

    const employer = await request(app)
      .get('/api/applications')
      .query({ scope: 'employer' })
      .set('Authorization', `Bearer ${sellerToken}`);
    expect(employer.status).toBe(200);
    expect(employer.body.some((item: { cvUrl?: string }) => item.cvUrl === upload.body.url)).toBe(
      true
    );

    fs.unlinkSync(tmp);
    const stored = path.join(EVIDENCE_UPLOAD_DIR.replace(`${path.sep}evidence`, `${path.sep}cv`), path.basename(upload.body.url));
    if (fs.existsSync(stored)) fs.unlinkSync(stored);
  });

  it('records security events into the in-memory audit log', async () => {
    recordSecurityEvent('auth.login.failure', { detail: { email: 'phase12@example.com' } });
    const events = await listSecurityEvents(10);
    expect(events[0]?.type).toBe('auth.login.failure');
  });
});
