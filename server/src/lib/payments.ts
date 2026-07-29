import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { hasDatabase, requireSql } from '../db/client.js';
import { createId } from './ids.js';

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export interface PaymentIntent {
  id: string;
  orderId: string;
  userId: string;
  provider: 'sandbox' | 'paystack';
  providerReference: string;
  amountCents: number;
  currency: 'ZAR';
  status: PaymentStatus;
  authorizationUrl?: string;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  capturedAt?: string;
  failedAt?: string;
  refundedCents: number;
  metadata?: Record<string, unknown>;
}

export interface PaymentWebhookEvent {
  id: string;
  provider: string;
  eventType: string;
  providerEventId: string;
  paymentId: string;
  payloadHash: string;
  processedAt: string;
}

export interface CreatePaymentIntentInput {
  orderId: string;
  userId: string;
  amountCents: number;
  idempotencyKey?: string;
}

const payments = new Map<string, PaymentIntent>();
const paymentsByOrder = new Map<string, string>();
const paymentsByReference = new Map<string, string>();
const webhookEvents = new Map<string, PaymentWebhookEvent>();

function cachePayment(intent: PaymentIntent) {
  payments.set(intent.id, intent);
  paymentsByOrder.set(intent.orderId, intent.id);
  paymentsByReference.set(intent.providerReference, intent.id);
}

function rowToPayment(row: Record<string, unknown>): PaymentIntent {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    userId: String(row.user_id),
    provider: row.provider === 'paystack' ? 'paystack' : 'sandbox',
    providerReference: String(row.provider_reference),
    amountCents: Number(row.amount_cents),
    currency: 'ZAR',
    status: String(row.status) as PaymentStatus,
    authorizationUrl: row.authorization_url ? String(row.authorization_url) : undefined,
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    capturedAt: row.captured_at ? String(row.captured_at) : undefined,
    failedAt: row.failed_at ? String(row.failed_at) : undefined,
    refundedCents: Number(row.refunded_cents ?? 0),
  };
}

async function persistPayment(intent: PaymentIntent) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_payments (
      id, order_id, user_id, provider, provider_reference, amount_cents, currency, status,
      authorization_url, idempotency_key, refunded_cents, created_at, updated_at, captured_at, failed_at
    ) VALUES (
      ${intent.id}, ${intent.orderId}, ${intent.userId}, ${intent.provider}, ${intent.providerReference},
      ${intent.amountCents}, ${intent.currency}, ${intent.status}, ${intent.authorizationUrl ?? null},
      ${intent.idempotencyKey ?? null}, ${intent.refundedCents}, ${intent.createdAt}, ${intent.updatedAt},
      ${intent.capturedAt ?? null}, ${intent.failedAt ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      refunded_cents = EXCLUDED.refunded_cents,
      updated_at = EXCLUDED.updated_at,
      captured_at = EXCLUDED.captured_at,
      failed_at = EXCLUDED.failed_at
  `;
}

async function persistWebhookEvent(event: PaymentWebhookEvent) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_payment_webhooks (
      id, provider, event_type, provider_event_id, payment_id, payload_hash, processed_at
    ) VALUES (
      ${event.id}, ${event.provider}, ${event.eventType}, ${event.providerEventId},
      ${event.paymentId}, ${event.payloadHash}, ${event.processedAt}
    )
    ON CONFLICT (provider, provider_event_id) DO NOTHING
  `;
}

export function paymentWebhookSecret() {
  if (env.isProduction) {
    if (!process.env.PAYMENT_WEBHOOK_SECRET) {
      throw new Error('PAYMENT_WEBHOOK_SECRET is required in production');
    }
    return process.env.PAYMENT_WEBHOOK_SECRET;
  }
  return process.env.PAYMENT_WEBHOOK_SECRET || env.jwtSecret || 'gridstore-dev-webhook';
}

export function paymentProvider(): 'sandbox' | 'paystack' {
  const value = (process.env.PAYMENT_PROVIDER ?? 'sandbox').toLowerCase();
  return value === 'paystack' ? 'paystack' : 'sandbox';
}

export function sandboxAutoCapture() {
  if (process.env.PAYMENT_SANDBOX_AUTO_CAPTURE === 'false') return false;
  return paymentProvider() === 'sandbox';
}

export function resetPaymentStoreForTests() {
  payments.clear();
  paymentsByOrder.clear();
  paymentsByReference.clear();
  webhookEvents.clear();
}

export async function getPayment(id: string) {
  const cached = payments.get(id);
  if (cached) return cached;
  if (!hasDatabase()) return undefined;
  const db = requireSql();
  const rows = (await db`SELECT * FROM gridstore_payments WHERE id = ${id} LIMIT 1`) as Record<
    string,
    unknown
  >[];
  if (!rows[0]) return undefined;
  const payment = rowToPayment(rows[0]);
  cachePayment(payment);
  return payment;
}

export async function getPaymentByOrder(orderId: string) {
  const id = paymentsByOrder.get(orderId);
  if (id) {
    const cached = payments.get(id);
    if (cached) return cached;
  }
  if (!hasDatabase()) return undefined;
  const db = requireSql();
  const rows = (await db`
    SELECT * FROM gridstore_payments
    WHERE order_id = ${orderId}
    ORDER BY created_at DESC
    LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  const payment = rowToPayment(rows[0]);
  cachePayment(payment);
  return payment;
}

export async function getPaymentByReference(reference: string) {
  const id = paymentsByReference.get(reference);
  if (id) {
    const cached = payments.get(id);
    if (cached) return cached;
  }
  if (!hasDatabase()) return undefined;
  const db = requireSql();
  const rows = (await db`
    SELECT * FROM gridstore_payments WHERE provider_reference = ${reference} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  const payment = rowToPayment(rows[0]);
  cachePayment(payment);
  return payment;
}

export async function listPayments() {
  if (hasDatabase()) {
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_payments ORDER BY created_at DESC
    `) as Record<string, unknown>[];
    return rows.map((row) => {
      const payment = rowToPayment(row);
      cachePayment(payment);
      return payment;
    });
  }
  return Array.from(payments.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createPaymentIntent(input: CreatePaymentIntentInput): Promise<PaymentIntent> {
  if (input.amountCents <= 0) {
    throw new Error('Payment amount must be positive');
  }

  if (input.idempotencyKey) {
    const cached = Array.from(payments.values()).find(
      (payment) => payment.userId === input.userId && payment.idempotencyKey === input.idempotencyKey
    );
    if (cached) return cached;
    if (hasDatabase()) {
      const db = requireSql();
      const rows = (await db`
        SELECT * FROM gridstore_payments
        WHERE user_id = ${input.userId} AND idempotency_key = ${input.idempotencyKey}
        LIMIT 1
      `) as Record<string, unknown>[];
      if (rows[0]) {
        const payment = rowToPayment(rows[0]);
        cachePayment(payment);
        return payment;
      }
    }
  }

  const existingForOrder = await getPaymentByOrder(input.orderId);
  if (existingForOrder && !['failed', 'cancelled'].includes(existingForOrder.status)) {
    return existingForOrder;
  }

  const provider = paymentProvider();
  const providerReference = `gs_${randomBytes(10).toString('hex')}`;
  const now = new Date().toISOString();
  const intent: PaymentIntent = {
    id: createId('pay'),
    orderId: input.orderId,
    userId: input.userId,
    provider,
    providerReference,
    amountCents: input.amountCents,
    currency: 'ZAR',
    status: 'pending',
    authorizationUrl:
      provider === 'sandbox'
        ? `${env.publicWebUrl}/checkout?sandboxPayment=${providerReference}`
        : `https://checkout.paystack.com/${providerReference}`,
    idempotencyKey: input.idempotencyKey,
    createdAt: now,
    updatedAt: now,
    refundedCents: 0,
  };

  cachePayment(intent);
  await persistPayment(intent);
  return intent;
}

export function signWebhookPayload(body: string, secret = paymentWebhookSecret()) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyWebhookSignature(body: string, signature: string | undefined) {
  if (!signature) return false;
  const expected = signWebhookPayload(body);
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashPayload(body: string) {
  return createHmac('sha256', 'gridstore-payload').update(body).digest('hex');
}

export type WebhookProcessResult =
  | { ok: true; payment: PaymentIntent; duplicate?: boolean }
  | { ok: false; error: string };

export async function processProviderWebhook(input: {
  providerEventId: string;
  eventType: 'payment.authorized' | 'payment.captured' | 'payment.failed' | 'payment.cancelled' | 'payment.refunded';
  reference: string;
  amountCents: number;
  rawBody: string;
}): Promise<WebhookProcessResult> {
  const provider = paymentProvider();
  const eventKey = `${provider}:${input.providerEventId}`;

  const memoryEvent = webhookEvents.get(eventKey);
  if (memoryEvent) {
    const payment = await getPayment(memoryEvent.paymentId);
    if (!payment) return { ok: false, error: 'Webhook replay references missing payment' };
    return { ok: true, payment, duplicate: true };
  }

  if (hasDatabase()) {
    const db = requireSql();
    const existing = (await db`
      SELECT * FROM gridstore_payment_webhooks
      WHERE provider = ${provider} AND provider_event_id = ${input.providerEventId}
      LIMIT 1
    `) as Array<{ payment_id: string }>;
    if (existing[0]) {
      const payment = await getPayment(existing[0].payment_id);
      if (!payment) return { ok: false, error: 'Webhook replay references missing payment' };
      return { ok: true, payment, duplicate: true };
    }
  }

  const payment = await getPaymentByReference(input.reference);
  if (!payment) {
    return { ok: false, error: 'Unknown payment reference' };
  }

  if (input.amountCents !== payment.amountCents && input.eventType !== 'payment.refunded') {
    return { ok: false, error: 'Amount mismatch' };
  }

  const now = new Date().toISOString();
  switch (input.eventType) {
    case 'payment.authorized':
      if (payment.status === 'pending') payment.status = 'authorized';
      break;
    case 'payment.captured':
      if (!['pending', 'authorized'].includes(payment.status)) {
        return { ok: false, error: `Cannot capture payment in status ${payment.status}` };
      }
      payment.status = 'captured';
      payment.capturedAt = now;
      break;
    case 'payment.failed':
      payment.status = 'failed';
      payment.failedAt = now;
      break;
    case 'payment.cancelled':
      payment.status = 'cancelled';
      break;
    case 'payment.refunded':
      payment.refundedCents = payment.amountCents;
      payment.status = 'refunded';
      break;
    default:
      return { ok: false, error: 'Unsupported event' };
  }
  payment.updatedAt = now;
  cachePayment(payment);
  await persistPayment(payment);

  const event: PaymentWebhookEvent = {
    id: createId('pwh'),
    provider: payment.provider,
    eventType: input.eventType,
    providerEventId: input.providerEventId,
    paymentId: payment.id,
    payloadHash: hashPayload(input.rawBody),
    processedAt: now,
  };
  webhookEvents.set(eventKey, event);
  await persistWebhookEvent(event);

  return { ok: true, payment };
}

export async function markPaymentRefunded(paymentId: string, amountCents: number) {
  const payment = await getPayment(paymentId);
  if (!payment) throw new Error('Payment not found');
  if (payment.status !== 'captured' && payment.status !== 'partially_refunded') {
    throw new Error('Only captured payments can be refunded');
  }
  const next = payment.refundedCents + amountCents;
  if (next > payment.amountCents) {
    throw new Error('Refund exceeds captured amount');
  }
  payment.refundedCents = next;
  payment.status = next === payment.amountCents ? 'refunded' : 'partially_refunded';
  payment.updatedAt = new Date().toISOString();
  cachePayment(payment);
  await persistPayment(payment);
  return payment;
}

export function canonicalizeWebhookPayload(payload: {
  providerEventId: string;
  eventType: string;
  reference: string;
  amountCents: number;
}) {
  return JSON.stringify({
    providerEventId: payload.providerEventId,
    eventType: payload.eventType,
    reference: payload.reference,
    amountCents: payload.amountCents,
  });
}

export function buildSandboxCaptureEvent(payment: PaymentIntent) {
  const payload = {
    providerEventId: `evt_${randomBytes(8).toString('hex')}`,
    eventType: 'payment.captured' as const,
    reference: payment.providerReference,
    amountCents: payment.amountCents,
  };
  const rawBody = canonicalizeWebhookPayload(payload);
  return {
    ...payload,
    rawBody,
    signature: signWebhookPayload(rawBody),
  };
}
