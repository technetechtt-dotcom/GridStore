import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
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

export function paymentWebhookSecret() {
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

export function getPayment(id: string) {
  return payments.get(id);
}

export function getPaymentByOrder(orderId: string) {
  const id = paymentsByOrder.get(orderId);
  return id ? payments.get(id) : undefined;
}

export function getPaymentByReference(reference: string) {
  const id = paymentsByReference.get(reference);
  return id ? payments.get(id) : undefined;
}

export function listPayments() {
  return Array.from(payments.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createPaymentIntent(input: CreatePaymentIntentInput): PaymentIntent {
  if (input.amountCents <= 0) {
    throw new Error('Payment amount must be positive');
  }

  if (input.idempotencyKey) {
    const existing = Array.from(payments.values()).find(
      (payment) =>
        payment.userId === input.userId &&
        payment.idempotencyKey === input.idempotencyKey
    );
    if (existing) return existing;
  }

  const existingForOrder = getPaymentByOrder(input.orderId);
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

  payments.set(intent.id, intent);
  paymentsByOrder.set(intent.orderId, intent.id);
  paymentsByReference.set(intent.providerReference, intent.id);
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

export function processProviderWebhook(input: {
  providerEventId: string;
  eventType: 'payment.authorized' | 'payment.captured' | 'payment.failed' | 'payment.cancelled' | 'payment.refunded';
  reference: string;
  amountCents: number;
  rawBody: string;
}): WebhookProcessResult {
  const existingEvent = webhookEvents.get(`${paymentProvider()}:${input.providerEventId}`);
  if (existingEvent) {
    const payment = getPayment(existingEvent.paymentId);
    if (!payment) return { ok: false, error: 'Webhook replay references missing payment' };
    return { ok: true, payment, duplicate: true };
  }

  const payment = getPaymentByReference(input.reference);
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

  const event: PaymentWebhookEvent = {
    id: createId('pwh'),
    provider: payment.provider,
    eventType: input.eventType,
    providerEventId: input.providerEventId,
    paymentId: payment.id,
    payloadHash: hashPayload(input.rawBody),
    processedAt: now,
  };
  webhookEvents.set(`${payment.provider}:${input.providerEventId}`, event);

  return { ok: true, payment };
}

export function markPaymentRefunded(paymentId: string, amountCents: number) {
  const payment = getPayment(paymentId);
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
