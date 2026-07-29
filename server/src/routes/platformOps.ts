import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { addDisputeEvidence, listDisputes, openDispute, resolveDispute } from '../lib/disputes.js';
import { listPayouts, markPayoutPaid, scheduleSellerPayout } from '../lib/settlement.js';
import { addShippingEvent, listShippingEvents } from '../lib/shipping.js';
import { collectMonitoringSnapshot } from '../lib/monitoring.js';
import { processJobQueue, enqueueRecurringJobs } from '../jobs/worker.js';
import { listJobs } from '../jobs/queue.js';

export const platformOpsRouter = Router();

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
  const parsed = z.object({ note: z.string().min(3).max(2000) }).safeParse(req.body);
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

platformOpsRouter.post('/orders/:orderId/shipping-events', requireAuth, async (req: AuthenticatedRequest, res) => {
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

platformOpsRouter.get('/orders/:orderId/shipping-events', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json(await listShippingEvents(req.params.orderId));
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
