import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  accountBalanceCents,
  listLedgerJournals,
  validateLedgerIntegrity,
} from '../lib/ledger.js';
import { getPaymentByOrder } from '../lib/payments.js';
import {
  applyVerifiedWebhook,
  createIntentForOrder,
  refundCapturedPayment,
} from '../services/paymentService.js';

export const paymentsRouter = Router();

const webhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

paymentsRouter.post('/webhooks/:provider', webhookLimiter, async (req, res) => {
  try {
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
    const signature =
      (req.header('x-gridstore-signature') || req.header('x-paystack-signature') || undefined) ??
      undefined;
    const result = await applyVerifiedWebhook({
      rawBody,
      signature,
      parsedBody: typeof req.body === 'string' ? undefined : req.body,
    });
    res.status(result.duplicate ? 200 : 201).json({
      ok: true,
      duplicate: Boolean(result.duplicate),
      paymentId: result.payment.id,
      status: result.payment.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook rejected';
    const status = /signature/i.test(message) ? 401 : 400;
    res.status(status).json({ error: message });
  }
});

paymentsRouter.use(requireAuth);

paymentsRouter.post('/intents', async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({
      orderId: z.string().min(1),
      idempotencyKey: z.string().min(8).max(128).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payment intent payload' });
    return;
  }

  try {
    const intent = await createIntentForOrder({
      orderId: parsed.data.orderId,
      userId: req.user!.id,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    res.status(201).json(intent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create payment intent';
    res.status(400).json({ error: message });
  }
});

paymentsRouter.get('/orders/:orderId', (req: AuthenticatedRequest, res) => {
  const payment = getPaymentByOrder(req.params.orderId);
  if (!payment || payment.userId !== req.user!.id) {
    res.status(404).json({ error: 'Payment not found' });
    return;
  }
  res.json(payment);
});

paymentsRouter.post('/orders/:orderId/refund', async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({ amountCents: z.number().int().positive().optional() })
    .safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid refund payload' });
    return;
  }

  try {
    const payment = await refundCapturedPayment({
      orderId: req.params.orderId,
      userId: req.user!.id,
      amountCents: parsed.data.amountCents,
    });
    res.json(payment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refund payment';
    res.status(400).json({ error: message });
  }
});

paymentsRouter.get('/ledger/summary', (req: AuthenticatedRequest, res) => {
  if (!['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  validateLedgerIntegrity();
  res.json({
    journals: listLedgerJournals().length,
    balances: {
      cash_provider: accountBalanceCents('cash_provider'),
      seller_payable: accountBalanceCents('seller_payable'),
      platform_fees: accountBalanceCents('platform_fees'),
    },
  });
});
