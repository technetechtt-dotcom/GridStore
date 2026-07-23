import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { listEmailOutbox, resetAuthSecurityStateForTests } from './lib/authSecurity.js';
import { setStoresReady } from './storeReadiness.js';
import { initPlatformStore } from './store/index.js';
import { initUserFeaturesStore } from './store/userFeatures/index.js';
import { initStoresStore } from './store/stores/index.js';
import { initTradeStore } from './store/trade/index.js';

describe('phase 2 authentication', () => {
  const app = createApp();

  beforeAll(async () => {
    resetAuthSecurityStateForTests();
    setStoresReady(false);
    await initPlatformStore();
    await initUserFeaturesStore();
    await initTradeStore();
    await initStoresStore();
    setStoresReady(true);
  });

  it('issues access/refresh tokens and does not put tokens on /me', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'buyer@gridstore.local', password: 'DemoSeed-ChangeMe1' });

    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();
    expect(login.body.user.accessToken).toBeUndefined();
    expect(login.body.user.sessionToken).toBeUndefined();

    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.user.sessionToken).toBeUndefined();
    expect(me.body.user.accessToken).toBeUndefined();
  });

  it('supports single-use password reset tokens and revokes sessions', async () => {
    const email = `reset-${Date.now()}@example.com`;
    const signup = await request(app).post('/api/auth/signup').send({
      name: 'Reset User',
      email,
      password: 'ResetPass12a',
    });
    const oldAccess = signup.body.accessToken as string;

    await request(app).post('/api/auth/password-reset').send({ email });
    const message = listEmailOutbox().find((item) => item.to === email && item.subject.includes('Reset'));
    expect(message?.body).toBeTruthy();
    const token = message!.body.split(': ').pop()!.trim();

    const confirm = await request(app).post('/api/auth/password-reset/confirm').send({
      token,
      password: 'FreshPass99x',
    });
    expect(confirm.status).toBe(200);

    const reuse = await request(app).post('/api/auth/password-reset/confirm').send({
      token,
      password: 'AnotherPass99',
    });
    expect(reuse.status).toBe(400);

    const oldSession = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldAccess}`);
    expect(oldSession.status).toBe(401);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'FreshPass99x' });
    expect(login.status).toBe(200);
  });

  it('locks accounts after repeated failed logins', async () => {
    const email = `lock-${Date.now()}@example.com`;
    await request(app).post('/api/auth/signup').send({
      name: 'Lock User',
      email,
      password: 'LockPass12a',
    });

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/api/auth/login').send({ email, password: 'WrongPass12' });
    }

    const locked = await request(app).post('/api/auth/login').send({
      email,
      password: 'LockPass12a',
    });
    expect(locked.status).toBe(400);
    expect(String(locked.body.error)).toMatch(/locked/i);
  }, 15_000);

  it('exposes PKCE OAuth start scaffolding', async () => {
    const started = await request(app).get('/api/auth/oauth/google/start');
    expect(started.status).toBe(200);
    expect(started.body.state).toBeTruthy();
    expect(started.body.codeChallenge).toBeTruthy();
    expect(started.body.codeVerifier).toBeTruthy();
  });
});
