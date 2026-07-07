import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const cartRouter = Router();

cartRouter.use(requireAuth);

cartRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const cart = await userFeaturesStore.getCart(req.user!.id);
  res.json(cart);
});

cartRouter.put('/', async (req: AuthenticatedRequest, res) => {
  const parsed = z.record(z.string(), z.number().int().nonnegative()).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid cart payload' });
    return;
  }
  const cart = await userFeaturesStore.saveCart(req.user!.id, parsed.data);
  res.json(cart);
});
