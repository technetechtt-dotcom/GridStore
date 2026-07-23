import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/roles.js';
import { recordSecurityEvent } from '../lib/security.js';
import { platformStore } from '../store/index.js';

export const sellerApplicationsRouter = Router();

const applicationSchema = z.object({
  businessName: z.string().min(2),
  category: z.string().min(2),
  location: z.string().min(2),
  description: z.string().min(20),
});

sellerApplicationsRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = applicationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid seller application', details: parsed.error.flatten() });
    return;
  }

  try {
    const application = await platformStore.createSellerApplication(req.user!.id, parsed.data);
    recordSecurityEvent('seller.application.submitted', {
      actorId: req.user!.id,
      targetId: application.id,
      ip: req.ip,
      requestId: req.requestId,
    });
    res.status(201).json({ application });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit application';
    res.status(400).json({ error: message });
  }
});

sellerApplicationsRouter.get('/mine', requireAuth, async (req: AuthenticatedRequest, res) => {
  const application = await platformStore.getSellerApplication(req.user!.id);
  res.json({ application: application ?? null });
});

sellerApplicationsRouter.get('/', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ applications: await platformStore.listSellerApplications() });
});

sellerApplicationsRouter.post(
  '/:id/review',
  requireAuth,
  requireAdmin,
  async (req: AuthenticatedRequest, res) => {
    const parsed = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        currentPassword: z.string().min(1),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid review payload' });
      return;
    }

    const valid = await platformStore.verifyPassword(req.user!.id, parsed.data.currentPassword);
    if (!valid) {
      recordSecurityEvent('seller.application.review.reauth_failed', {
        actorId: req.user!.id,
        ip: req.ip,
        requestId: req.requestId,
      });
      res.status(401).json({ error: 'Reauthentication failed' });
      return;
    }

    try {
      const application = await platformStore.reviewSellerApplication(
        req.params.id,
        req.user!.id,
        parsed.data.decision
      );
      recordSecurityEvent('seller.application.reviewed', {
        actorId: req.user!.id,
        targetId: application.userId,
        ip: req.ip,
        requestId: req.requestId,
        detail: { decision: parsed.data.decision },
      });
      res.json({ application });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to review application';
      res.status(404).json({ error: message });
    }
  }
);
