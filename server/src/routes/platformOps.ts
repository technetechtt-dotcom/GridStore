import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { addDisputeEvidence, listDisputes, openDispute, resolveDispute } from '../lib/disputes.js';
import { listPayouts, markPayoutPaid, scheduleSellerPayout, sellerPayoutSummary } from '../lib/settlement.js';
import { addShippingEvent, findOrderIdByTrackingNumber, listShippingEvents } from '../lib/shipping.js';
import { createCarrierShipment, getSandboxLabel } from '../lib/carriers/index.js';
import { collectMonitoringSnapshot } from '../lib/monitoring.js';
import { processJobQueue, enqueueRecurringJobs } from '../jobs/worker.js';
import { listJobs } from '../jobs/queue.js';
import {
  getSellerPayoutProfile,
  publicPayoutProfile,
  SA_BANK_OPTIONS,
  upsertSellerPayoutProfile,
} from '../lib/sellerPayoutProfile.js';
import { addReturnEvidence, listReturns, openReturnRequest, transitionReturn } from '../lib/returns.js';
import { platformStore } from '../store/index.js';

export const platformOpsRouter = Router();

const platformMutatingLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many platform requests' },
});

platformOpsRouter.use((req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') {
    next();
    return;
  }
  platformMutatingLimiter(req, res, next);
});

const attachmentFields = {
  attachmentUrl: z.union([z.string().url().max(2000), z.string().regex(/^\/api\/uploads\/evidence\/[A-Za-z0-9._-]+$/)]).optional(),
  attachmentName: z.string().min(1).max(260).optional(),
  mimeType: z.string().min(3).max(120).optional(),
};

platformOpsRouter.post('/disputes', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({ orderId: z.string().min(1), reason: z.string().min(8).max(2000) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid dispute payload' });
    return;
  }
  try {
    const dispute = await openDispute({
      orderId: parsed.data.orderId,
      openedBy: req.user!.id,
      reason: parsed.data.reason,
    });
    res.status(201).json(dispute);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to open dispute' });
  }
});

platformOpsRouter.get('/disputes', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(await listDisputes(typeof req.query.orderId === 'string' ? req.query.orderId : undefined));
});

platformOpsRouter.post('/disputes/:id/evidence', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({ note: z.string().min(3).max(2000), ...attachmentFields })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid evidence payload' });
    return;
  }
  try {
    res.json(
      await addDisputeEvidence({
        disputeId: req.params.id,
        actorId: req.user!.id,
        note: parsed.data.note,
        attachmentUrl: parsed.data.attachmentUrl,
        attachmentName: parsed.data.attachmentName,
        mimeType: parsed.data.mimeType,
      })
    );
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to add evidence' });
  }
});

platformOpsRouter.post('/disputes/:id/resolve', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({ resolution: z.enum(['resolved_buyer', 'resolved_seller', 'closed']) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid resolution payload' });
    return;
  }
  try {
    res.json(
      await resolveDispute({
        disputeId: req.params.id,
        actorId: req.user!.id,
        resolution: parsed.data.resolution,
      })
    );
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to resolve dispute' });
  }
});

platformOpsRouter.post('/payouts', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  const parsed = z
    .object({
      sellerId: z.string().min(1),
      amountCents: z.number().int().positive(),
      memo: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payout payload' });
    return;
  }
  try {
    res.status(201).json(await scheduleSellerPayout(parsed.data));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to schedule payout' });
  }
});

platformOpsRouter.post('/payouts/:id/pay', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  try {
    res.json(await markPayoutPaid(req.params.id, req.user!.id));
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to pay out' });
  }
});

platformOpsRouter.get('/payouts', requireAuth, async (req: AuthenticatedRequest, res) => {
  const sellerId =
    ['admin', 'moderator'].includes(req.user!.role) && typeof req.query.sellerId === 'string'
      ? req.query.sellerId
      : req.user!.role === 'seller'
        ? req.user!.id
        : undefined;
  if (!sellerId && !['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(await listPayouts(sellerId));
});

platformOpsRouter.get('/payouts/summary', requireAuth, async (req: AuthenticatedRequest, res) => {
  const sellerId =
    ['admin', 'moderator'].includes(req.user!.role) && typeof req.query.sellerId === 'string'
      ? req.query.sellerId
      : req.user!.id;
  if (req.user!.role === 'buyer' && sellerId !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  if (!['admin', 'moderator', 'seller'].includes(req.user!.role) && sellerId !== req.user!.id) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(await sellerPayoutSummary(sellerId));
});

function canManageShipping(order: { userId: string; lines: Array<{ sellerId?: string }> }, userId: string, role: string) {
  const isStaff = ['admin', 'moderator'].includes(role);
  const isBuyer = order.userId === userId;
  const isSeller = order.lines.some((line) => line.sellerId === userId);
  return { isStaff, isBuyer, isSeller, allowed: isStaff || isBuyer || isSeller };
}

function canWriteShipping(order: { userId: string; lines: Array<{ sellerId?: string }> }, userId: string, role: string) {
  const { isStaff, isSeller } = canManageShipping(order, userId, role);
  return isStaff || isSeller;
}

platformOpsRouter.post('/orders/:orderId/shipping-events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const order = platformStore.listAllOrders().find((item) => item.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (!canWriteShipping(order, req.user!.id, req.user!.role)) {
    res.status(403).json({ error: 'Only the seller or support staff can record shipping events' });
    return;
  }
  const parsed = z
    .object({
      status: z.string().min(2).max(80),
      carrier: z.string().max(80).optional(),
      trackingNumber: z.string().max(120).optional(),
      location: z.string().max(200).optional(),
      note: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid shipping event' });
    return;
  }
  try {
    res.status(201).json(
      await addShippingEvent({
        orderId: req.params.orderId,
        actorId: req.user!.id,
        ...parsed.data,
      })
    );
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to record shipping event' });
  }
});

platformOpsRouter.post('/orders/:orderId/shipments', requireAuth, async (req: AuthenticatedRequest, res) => {
  const order = platformStore.listAllOrders().find((item) => item.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  if (!canWriteShipping(order, req.user!.id, req.user!.role)) {
    res.status(403).json({ error: 'Only the seller or support staff can create shipments' });
    return;
  }
  try {
    const shipment = await createCarrierShipment({
      orderId: order.id,
      deliveryAddress: order.deliveryAddress,
      actorId: req.user!.id,
    });
    if (!shipment) {
      res.status(400).json({ error: 'Shipping provider is set to manual — supply a tracking number on ship' });
      return;
    }
    order.trackingNumber = shipment.trackingNumber;
    const event = await addShippingEvent({
      orderId: order.id,
      actorId: req.user!.id,
      status: shipment.status,
      carrier: shipment.carrier,
      trackingNumber: shipment.trackingNumber,
      note: `Sandbox label ${shipment.labelId}`,
    });
    res.status(201).json({ shipment, event });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to create shipment' });
  }
});

platformOpsRouter.get('/shipping/labels/:labelId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const label = getSandboxLabel(req.params.labelId);
  if (!label) {
    res.status(404).json({ error: 'Label not found' });
    return;
  }
  const order = platformStore.listAllOrders().find((item) => item.id === label.orderId);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const access = canManageShipping(order, req.user!.id, req.user!.role);
  if (!access.allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(label.html);
});

platformOpsRouter.get('/orders/:orderId/shipping-events', requireAuth, async (req: AuthenticatedRequest, res) => {
  const order = platformStore.listAllOrders().find((item) => item.id === req.params.orderId);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const access = canManageShipping(order, req.user!.id, req.user!.role);
  if (!access.allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(await listShippingEvents(req.params.orderId));
});

platformOpsRouter.get('/shipping/track', requireAuth, async (req: AuthenticatedRequest, res) => {
  const trackingNumber = typeof req.query.trackingNumber === 'string' ? req.query.trackingNumber.trim() : '';
  if (!trackingNumber) {
    res.status(400).json({ error: 'trackingNumber is required' });
    return;
  }
  const orderId = await findOrderIdByTrackingNumber(trackingNumber);
  if (!orderId) {
    res.status(404).json({ error: 'Tracking number not found' });
    return;
  }
  const order = platformStore.listAllOrders().find((item) => item.id === orderId);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  const access = canManageShipping(order, req.user!.id, req.user!.role);
  if (!access.allowed) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json({
    orderId: order.id,
    status: order.status,
    trackingNumber: order.trackingNumber ?? trackingNumber,
    deliveryAddress: order.deliveryAddress,
    events: await listShippingEvents(order.id),
  });
});

platformOpsRouter.get('/monitoring', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(await collectMonitoringSnapshot());
});

platformOpsRouter.get('/jobs', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  res.json(await listJobs(50));
});

platformOpsRouter.post('/jobs/run', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  await enqueueRecurringJobs();
  const processed = await processJobQueue(20);
  res.json({ ok: true, processed, jobs: await listJobs(20) });
});

platformOpsRouter.get('/payout-profile/banks', requireAuth, (_req, res) => {
  res.json(SA_BANK_OPTIONS);
});

platformOpsRouter.get('/payout-profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (!['seller', 'admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Seller account required' });
    return;
  }
  const sellerId =
    ['admin', 'moderator'].includes(req.user!.role) && typeof req.query.sellerId === 'string'
      ? req.query.sellerId
      : req.user!.id;
  const profile = await getSellerPayoutProfile(sellerId);
  res.json(profile ? publicPayoutProfile(profile) : null);
});

platformOpsRouter.put('/payout-profile', requireAuth, async (req: AuthenticatedRequest, res) => {
  if (req.user!.role !== 'seller' && !['admin', 'moderator'].includes(req.user!.role)) {
    res.status(403).json({ error: 'Seller account required' });
    return;
  }
  const parsed = z
    .object({
      accountName: z.string().min(2).max(120),
      accountNumber: z.string().min(6).max(20),
      bankCode: z.string().min(3).max(20),
      bankName: z.string().max(80).optional(),
      sellerId: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payout profile payload' });
    return;
  }
  try {
    const sellerId =
      ['admin', 'moderator'].includes(req.user!.role) && parsed.data.sellerId
        ? parsed.data.sellerId
        : req.user!.id;
    res.json(
      await upsertSellerPayoutProfile({
        sellerId,
        accountName: parsed.data.accountName,
        accountNumber: parsed.data.accountNumber,
        bankCode: parsed.data.bankCode,
        bankName: parsed.data.bankName,
      })
    );
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to save payout profile' });
  }
});

platformOpsRouter.post('/returns', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({
      orderId: z.string().min(1),
      reason: z.string().min(8).max(2000),
      evidenceNote: z.string().min(3).max(2000).optional(),
      ...attachmentFields,
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid return payload' });
    return;
  }
  try {
    const item = await openReturnRequest({
      orderId: parsed.data.orderId,
      buyerId: req.user!.id,
      reason: parsed.data.reason,
      evidenceNote: parsed.data.evidenceNote,
      attachmentUrl: parsed.data.attachmentUrl,
      attachmentName: parsed.data.attachmentName,
      mimeType: parsed.data.mimeType,
    });
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to open return' });
  }
});

platformOpsRouter.get('/returns', requireAuth, async (req: AuthenticatedRequest, res) => {
  const isStaff = ['admin', 'moderator'].includes(req.user!.role);
  if (isStaff) {
    res.json(
      await listReturns(
        typeof req.query.orderId === 'string' ? { orderId: req.query.orderId } : undefined
      )
    );
    return;
  }
  res.json(await listReturns({ buyerId: req.user!.id }));
});

platformOpsRouter.post('/returns/:id/evidence', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({ note: z.string().min(3).max(2000), ...attachmentFields })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid evidence payload' });
    return;
  }
  try {
    res.json(
      await addReturnEvidence({
        returnId: req.params.id,
        actorId: req.user!.id,
        note: parsed.data.note,
        attachmentUrl: parsed.data.attachmentUrl,
        attachmentName: parsed.data.attachmentName,
        mimeType: parsed.data.mimeType,
      })
    );
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to add evidence' });
  }
});

platformOpsRouter.post('/returns/:id/transitions', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({
      action: z.enum(['approve', 'reject', 'mark_shipped', 'mark_received', 'refund', 'close']),
      notes: z.string().max(2000).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid return transition' });
    return;
  }
  try {
    res.json(
      await transitionReturn({
        returnId: req.params.id,
        actorId: req.user!.id,
        action: parsed.data.action,
        notes: parsed.data.notes,
      })
    );
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to update return' });
  }
});
