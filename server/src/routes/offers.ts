import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireSeller, type AuthenticatedRequest } from '../middleware/auth.js';
import { platformStore } from '../store/index.js';
import { tradeStore } from '../store/trade/index.js';

export const offersRouter = Router();

const offerSchema = z.object({
  listingId: z.string(),
  amount: z.number().positive(),
  message: z.string().optional(),
});

const respondSchema = z.object({
  action: z.enum(['accept', 'decline', 'counter']),
  counterAmount: z.number().positive().optional(),
});

offersRouter.post('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = offerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid offer payload' });
    return;
  }

  const listing = platformStore.getListing(parsed.data.listingId);
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  try {
    const offer = await tradeStore.createOffer({
      listingId: parsed.data.listingId,
      listingTitle: listing.title,
      buyerId: req.user!.id,
      buyerName: req.user!.name,
      amount: parsed.data.amount,
      message: parsed.data.message,
    });
    res.status(201).json(offer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to submit offer';
    res.status(400).json({ error: message });
  }
});

offersRouter.get('/mine', requireAuth, async (req: AuthenticatedRequest, res) => {
  const offers = await tradeStore.listOffersForBuyer(req.user!.id);
  res.json(offers);
});

offersRouter.get('/incoming', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  const offers = await tradeStore.listOffersForSeller(req.user!.id);
  res.json(offers);
});

offersRouter.get('/listing/:listingId', requireAuth, async (req: AuthenticatedRequest, res) => {
  const listing = platformStore.getListing(req.params.listingId);
  if (!listing) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }

  const isSeller = listing.sellerId === req.user!.id;
  const offers = await tradeStore.listOffersForListing(req.params.listingId);
  res.json(isSeller ? offers : offers.filter((offer) => offer.buyerId === req.user!.id));
});

offersRouter.patch('/:id/respond', requireAuth, requireSeller, async (req: AuthenticatedRequest, res) => {
  const parsed = respondSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid response payload' });
    return;
  }

  try {
    const offer = await tradeStore.respondToOffer(
      req.params.id,
      req.user!.id,
      parsed.data.action,
      parsed.data.counterAmount
    );
    res.json(offer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to respond to offer';
    res.status(400).json({ error: message });
  }
});
