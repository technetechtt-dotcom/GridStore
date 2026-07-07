import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, requireSeller, type AuthenticatedRequest } from '../middleware/auth.js';
import { storesStore } from '../store/stores/index.js';

export const storesRouter = Router();

const storeSchema = z.object({
  name: z.string().min(2),
  category: z.string().min(2),
  location: z.string().min(2),
  description: z.string().min(10),
  supportEmail: z.string().email().optional(),
  image: z.string().url().optional(),
  status: z.enum(['active', 'draft', 'paused']).optional(),
});

storesRouter.get('/', optionalAuth, async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const stores = await storesStore.listPublicStores(q);
  res.json(stores);
});

storesRouter.get('/mine', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  const stores = await storesStore.listOwnerStores(req.user!.id);
  res.json(stores);
});

storesRouter.get('/:id', async (req, res) => {
  const store = await storesStore.getStore(req.params.id);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  res.json(store);
});

storesRouter.post('/', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid store payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const store = await storesStore.createStore(
      req.user!.id,
      Boolean(req.user!.verified),
      parsed.data
    );
    res.status(201).json(store);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create store';
    res.status(400).json({ error: message });
  }
});

storesRouter.patch('/:id', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  const parsed = storeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid store payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const store = await storesStore.updateStore(req.user!.id, req.params.id, parsed.data);
    res.json(store);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update store';
    res.status(404).json({ error: message });
  }
});
