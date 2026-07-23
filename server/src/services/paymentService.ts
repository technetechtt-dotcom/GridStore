import {
  buildSandboxCaptureEvent,
  canonicalizeWebhookPayload,
  createPaymentIntent,
  getPayment,
  getPaymentByOrder,
  listPayments,
  markPaymentRefunded,
  processProviderWebhook,
  sandboxAutoCapture,
  verifyWebhookSignature,
  type PaymentIntent,
} from '../lib/payments.js';
import { postPaymentCaptureJournal, postRefundJournal, validateLedgerIntegrity } from '../lib/ledger.js';
import { recordSecurityEvent } from '../lib/security.js';
import { platformStore } from '../store/index.js';

export async function createIntentForOrder(input: {
  orderId: string;
  userId: string;
  idempotencyKey?: string;
}): Promise<PaymentIntent> {
  const order = platformStore.getOrder(input.userId, input.orderId);
  if (!order) {
    throw new Error('Order not found');
  }
  if (order.status !== 'pending_payment') {
    throw new Error('Payment intents can only be created for pending orders');
  }

  const intent = createPaymentIntent({
    orderId: order.id,
    userId: input.userId,
    amountCents: order.totalCents,
    idempotencyKey: input.idempotencyKey,
  });

  if (sandboxAutoCapture() && intent.status === 'pending') {
    const event = buildSandboxCaptureEvent(intent);
    await applyVerifiedWebhook({
      rawBody: event.rawBody,
      signature: event.signature,
    });
    return getPayment(intent.id)!;
  }

  return intent;
}

export async function applyVerifiedWebhook(input: {
  rawBody: string;
  signature?: string;
  parsedBody?: unknown;
}): Promise<{ payment: PaymentIntent; duplicate?: boolean }> {
  let parsed: {
    providerEventId: string;
    eventType: 'payment.authorized' | 'payment.captured' | 'payment.failed' | 'payment.cancelled' | 'payment.refunded';
    reference: string;
    amountCents: number;
  };
  try {
    parsed = (input.parsedBody ?? JSON.parse(input.rawBody)) as typeof parsed;
  } catch {
    throw new Error('Invalid webhook payload');
  }

  const canonical = canonicalizeWebhookPayload(parsed);
  if (!verifyWebhookSignature(canonical, input.signature)) {
    recordSecurityEvent('payment.webhook.invalid_signature', {});
    throw new Error('Invalid webhook signature');
  }

  const result = processProviderWebhook({
    ...parsed,
    rawBody: canonical,
  });
  if (!result.ok) {
    throw new Error(result.error);
  }

  if (result.duplicate) {
    return { payment: result.payment, duplicate: true };
  }

  const payment = result.payment;
  if (parsed.eventType === 'payment.captured') {
    await platformStore.transitionOrder(
      { userId: 'system', role: 'system' },
      payment.orderId,
      'confirm_payment'
    );
    postPaymentCaptureJournal({
      orderId: payment.orderId,
      paymentId: payment.id,
      amountCents: payment.amountCents,
    });
    validateLedgerIntegrity();
    recordSecurityEvent('payment.captured', {
      actorId: payment.userId,
      targetId: payment.id,
      detail: { orderId: payment.orderId, amountCents: payment.amountCents },
    });
  }

  if (parsed.eventType === 'payment.refunded') {
    postRefundJournal({
      orderId: payment.orderId,
      paymentId: payment.id,
      amountCents: payment.amountCents,
    });
    validateLedgerIntegrity();
  }

  return { payment };
}

export async function refundCapturedPayment(input: {
  orderId: string;
  userId: string;
  amountCents?: number;
}) {
  const payment = getPaymentByOrder(input.orderId);
  if (!payment) {
    throw new Error('No payment found for order');
  }
  const amount = input.amountCents ?? payment.amountCents - payment.refundedCents;
  const updated = markPaymentRefunded(payment.id, amount);
  await platformStore.transitionOrder(
    { userId: input.userId, role: platformStore.getUserById(input.userId)?.role ?? 'buyer' },
    input.orderId,
    'refund'
  );
  postRefundJournal({
    orderId: input.orderId,
    paymentId: payment.id,
    amountCents: amount,
    createdBy: input.userId,
  });
  validateLedgerIntegrity();
  return updated;
}

export function adminListPayments() {
  return listPayments().map((payment) => {
    const order = platformStore.listAllOrders().find((item) => item.id === payment.orderId);
    return {
      id: payment.id,
      reference: payment.providerReference,
      method: payment.provider,
      amount: payment.amountCents / 100,
      amountCents: payment.amountCents,
      status: payment.status,
      buyer: order?.buyerName ?? payment.userId,
      createdAt: payment.createdAt,
      orderId: payment.orderId,
    };
  });
}
