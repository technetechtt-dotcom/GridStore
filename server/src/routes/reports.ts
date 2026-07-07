import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { requireModerator } from '../middleware/roles.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const reportsRouter = Router();

const reportSchema = z.object({
  targetType: z.enum(['listing', 'user', 'order']),
  targetId: z.string(),
  reason: z.string().optional(),
});

reportsRouter.use(requireAuth);

reportsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const items = await userFeaturesStore.listReports(req.user!.id);
  res.json(items);
});

reportsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = reportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid report payload' });
    return;
  }

  const report = await userFeaturesStore.createReport(req.user!.id, {
    targetType: parsed.data.targetType,
    targetId: parsed.data.targetId,
    reason: parsed.data.reason?.trim() || 'Needs marketplace review',
  });
  res.status(201).json(report);
});

reportsRouter.get('/moderation', requireModerator, async (_req, res) => {
  const items = await userFeaturesStore.listAllReports();
  res.json(items);
});
