import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, requireSeller, type AuthenticatedRequest } from '../middleware/auth.js';
import { platformStore } from '../store/index.js';

export const listingsRouter = Router();

const listingSchema = z.object({
  title: z.string().min(3),
  category: z.string().min(2),
  price: z.number().nonnegative(),
  inventory: z.number().int().nonnegative(),
  description: z.string().min(10),
  location: z.string().min(2),
});

listingsRouter.get('/', optionalAuth, (req: AuthenticatedRequest, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const status = typeof req.query.status === 'string' ? req.query.status : 'active';
  const mine = req.query.mine === 'true';

  if (mine) {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    res.json(platformStore.listSellerListings(req.user.id).map(stripSellerId));
    return;
  }

  res.json(platformStore.listPublicListings(q, status).map(stripSellerId));
});

listingsRouter.get('/:id', (req, res) => {
  const listing = platformStore.getListing(req.params.id);
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }
  res.json(stripSellerId(listing));
});

listingsRouter.post('/', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  const parsed = listingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid listing payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const listing = await platformStore.createListing(
      req.user!.id,
      req.user!.name,
      Boolean(req.user!.verified),
      parsed.data
    );
    res.status(201).json(stripSellerId(listing));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create listing';
    res.status(400).json({ error: message });
  }
});

listingsRouter.patch('/:id', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  const parsed = listingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid listing payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const listing = await platformStore.updateListing(req.user!.id, req.params.id, parsed.data);
    res.json(stripSellerId(listing));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update listing';
    res.status(404).json({ error: message });
  }
});

listingsRouter.post('/:id/toggle-pause', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  try {
    const listing = await platformStore.toggleListingPause(req.user!.id, req.params.id);
    res.json(stripSellerId(listing));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update listing';
    res.status(404).json({ error: message });
  }
});

function stripSellerId<T extends { sellerId?: string }>(listing: T) {
  const { sellerId: _sellerId, ...rest } = listing;
  return rest;
}
