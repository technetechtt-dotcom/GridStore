import { Router } from 'express';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const notificationsRouter = Router();

notificationsRouter.use(requireAuth);

notificationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const items = await userFeaturesStore.listNotifications(req.user!.id);
  res.json(items);
});

notificationsRouter.patch('/:id/read', async (req: AuthenticatedRequest, res) => {
  const items = await userFeaturesStore.markNotificationRead(req.user!.id, req.params.id);
  res.json(items);
});

notificationsRouter.post('/clear', async (req: AuthenticatedRequest, res) => {
  const items = await userFeaturesStore.clearAllNotifications(req.user!.id);
  res.json(items);
});
