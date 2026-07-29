import {
  buildSandboxCaptureEvent,
  canonicalizeWebhookPayload,
  createPaymentIntent,
  getPayment,
  getPaymentByOrder,
  listPayments,
  markPaymentRefunded,
  paymentProvider,
  processProviderWebhook,
  sandboxAutoCapture,
  verifyWebhookSignature,
  type PaymentIntent,
} from '../lib/payments.js';
import { mapPaystackWebhookEvent, refundPaystackTransaction, verifyPaystackTransaction, paystackConfigured } from '../lib/paystack.js';
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

  const intent = await createPaymentIntent({
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
    return (await getPayment(intent.id))!;
  }

  return intent;
}

async function assertProviderCaptureAllowed(reference: string, amountCents: number) {
  if (paymentProvider() !== 'paystack' || !paystackConfigured()) return;
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== 'success') {
    throw new Error(`Paystack verification failed: ${verified.status}`);
  }
  if (verified.amount !== amountCents) {
    throw new Error('Paystack verified amount does not match payment intent');
  }
}

export async function applyVerifiedWebhook(input: {
  rawBody: string;
  signature?: string;
  parsedBody?: unknown;
}): Promise<{ payment: PaymentIntent; duplicate?: boolean }> {
  const provider = paymentProvider();
  let parsed: {
    providerEventId: string;
    eventType: 'payment.authorized' | 'payment.captured' | 'payment.failed' | 'payment.cancelled' | 'payment.refunded';
    reference: string;
    amountCents: number;
  };

  try {
    const body =
      input.parsedBody ??
      (typeof input.rawBody === 'string' ? JSON.parse(input.rawBody) : input.rawBody);
    if (provider === 'paystack' && body && typeof body === 'object' && 'event' in (body as object)) {
      const mapped = mapPaystackWebhookEvent(body as Record<string, unknown>);
      if (!mapped) throw new Error('Unsupported Paystack webhook event');
      parsed = mapped;
    } else {
      parsed = body as typeof parsed;
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Unsupported')) throw error;
    throw new Error('Invalid webhook payload');
  }

  const signatureBody =
    provider === 'paystack' && process.env.PAYSTACK_SECRET_KEY ? input.rawBody : canonicalizeWebhookPayload(parsed);

  if (!verifyWebhookSignature(signatureBody, input.signature, provider)) {
    recordSecurityEvent('payment.webhook.invalid_signature', {});
    throw new Error('Invalid webhook signature');
  }

  if (parsed.eventType === 'payment.captured') {
    await assertProviderCaptureAllowed(parsed.reference, parsed.amountCents);
  }

  const result = await processProviderWebhook({
    ...parsed,
    rawBody: signatureBody,
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
    await postPaymentCaptureJournal({
      orderId: payment.orderId,
      paymentId: payment.id,
      amountCents: payment.amountCents,
    });
    await validateLedgerIntegrity();
    recordSecurityEvent('payment.captured', {
      actorId: payment.userId,
      targetId: payment.id,
      detail: { orderId: payment.orderId, amountCents: payment.amountCents },
    });
  }

  if (parsed.eventType === 'payment.refunded') {
    await postRefundJournal({
      orderId: payment.orderId,
      paymentId: payment.id,
      amountCents: payment.amountCents,
    });
    await validateLedgerIntegrity();
  }

  return { payment };
}

export async function refundCapturedPayment(input: {
  orderId: string;
  userId: string;
  amountCents?: number;
}) {
  const actor = platformStore.getUserById(input.userId);
  const role = actor?.role ?? 'buyer';
  if (role === 'buyer') {
    throw new Error('Refund execution requires admin, support, or authorised seller workflow');
  }

  const payment = await getPaymentByOrder(input.orderId);
  if (!payment) {
    return platformStore.transitionOrder({ userId: input.userId, role }, input.orderId, 'refund');
  }

  const amount = input.amountCents ?? payment.amountCents - payment.refundedCents;
  if (payment.provider === 'paystack' && paystackConfigured()) {
    await refundPaystackTransaction({
      reference: payment.providerReference,
      amountCents: amount,
      reason: `Refund for order ${input.orderId}`,
    });
  }

  const updated = await markPaymentRefunded(payment.id, amount);
  const order = await platformStore.transitionOrder({ userId: input.userId, role }, input.orderId, 'refund');
  await postRefundJournal({
    orderId: input.orderId,
    paymentId: payment.id,
    amountCents: amount,
    createdBy: input.userId,
  });
  await validateLedgerIntegrity();
  recordSecurityEvent('payment.refunded', {
    actorId: input.userId,
    targetId: payment.id,
    detail: { orderId: input.orderId, amountCents: amount },
  });
  return { payment: updated, order };
}

/** Unified refund path for orders route, disputes, and admin actions. */
export async function executeOrderRefund(input: { orderId: string; userId: string; amountCents?: number }) {
  const result = await refundCapturedPayment(input);
  return 'order' in result ? result.order : result;
}

export async function adminListPayments() {
  const rows = await listPayments();
  return rows.map((payment) => {
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
