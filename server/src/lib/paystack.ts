import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

export function paystackSecretKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    if (env.isProduction) {
      throw new Error('PAYSTACK_SECRET_KEY is required');
    }
    return '';
  }
  return key;
}

export function paystackConfigured() {
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

export function verifyPaystackSignature(rawBody: string, signature: string | undefined) {
  if (!signature) return false;
  const secret = paystackSecretKey();
  if (!secret) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest('hex');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function paystackRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const secret = paystackSecretKey();
  if (!secret) {
    throw new Error('Paystack is not configured');
  }
  const response = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as { status?: boolean; message?: string; data?: T };
  if (!response.ok || body.status === false) {
    throw new Error(body.message || `Paystack request failed (${response.status})`);
  }
  return body.data as T;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountCents: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}) {
  return paystackRequest<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }>('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      amount: input.amountCents,
      currency: 'ZAR',
      reference: input.reference,
      callback_url: input.callbackUrl ?? `${env.publicWebUrl}/checkout`,
      metadata: input.metadata ?? {},
    }),
  });
}

export async function verifyPaystackTransaction(reference: string) {
  return paystackRequest<{
    status: string;
    reference: string;
    amount: number;
    currency: string;
    paid_at?: string;
    gateway_response?: string;
    customer?: { email?: string };
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export async function refundPaystackTransaction(input: {
  reference: string;
  amountCents: number;
  reason?: string;
}) {
  if (!paystackConfigured()) {
    throw new Error('Paystack is not configured');
  }
  return paystackRequest<{
    transaction: { reference: string; status: string };
    amount: number;
    currency: string;
    status: string;
  }>('/refund', {
    method: 'POST',
    body: JSON.stringify({
      transaction: input.reference,
      amount: input.amountCents,
      currency: 'ZAR',
      customer_note: input.reason ?? 'GridStore order refund',
    }),
  });
}

export function mapPaystackWebhookEvent(payload: Record<string, unknown>): {
  providerEventId: string;
  eventType: 'payment.authorized' | 'payment.captured' | 'payment.failed' | 'payment.cancelled' | 'payment.refunded';
  reference: string;
  amountCents: number;
} | null {
  const event = String(payload.event ?? '');
  const data = (payload.data ?? {}) as Record<string, unknown>;
  const reference = String(data.reference ?? '');
  const amountCents = Number(data.amount ?? 0);
  const providerEventId = String(data.id ?? `${event}:${reference}:${amountCents}`);

  if (!reference || !Number.isFinite(amountCents)) return null;

  if (event === 'charge.success') {
    return { providerEventId, eventType: 'payment.captured', reference, amountCents };
  }
  if (event === 'charge.failed') {
    return { providerEventId, eventType: 'payment.failed', reference, amountCents };
  }
  if (event === 'refund.processed') {
    return { providerEventId, eventType: 'payment.refunded', reference, amountCents };
  }
  return null;
}
