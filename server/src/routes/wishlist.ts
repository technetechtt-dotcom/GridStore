import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const wishlistRouter = Router();

wishlistRouter.use(requireAuth);

wishlistRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const ids = await userFeaturesStore.getWishlist(req.user!.id);
  res.json(ids);
});

wishlistRouter.put('/', async (req: AuthenticatedRequest, res) => {
  const parsed = z.object({ productIds: z.array(z.string()) }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid wishlist payload' });
    return;
  }
  const ids = await userFeaturesStore.saveWishlist(req.user!.id, parsed.data.productIds);
  res.json(ids);
});

wishlistRouter.post('/:productId', async (req: AuthenticatedRequest, res) => {
  const current = await userFeaturesStore.getWishlist(req.user!.id);
  const next = current.includes(req.params.productId)
    ? current.filter((id) => id !== req.params.productId)
    : [...current, req.params.productId];
  const ids = await userFeaturesStore.saveWishlist(req.user!.id, next);
  res.json(ids);
});
