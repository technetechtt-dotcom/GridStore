import { Router } from 'express';
import { z } from 'zod';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { isAuctionLive } from '../lib/listingSale.js';
import { platformStore } from '../store/index.js';
import { tradeStore } from '../store/trade/index.js';

export const auctionsRouter = Router();

const bidSchema = z.object({
  amount: z.number().positive(),
});

auctionsRouter.get('/', optionalAuth, (_req, res) => {
  const auctions = platformStore.listAuctionListings().map((listing) => ({
    ...listing,
    sellerId: undefined,
    isLive: isAuctionLive(listing),
  }));
  res.json(auctions);
});

auctionsRouter.get('/:listingId', optionalAuth, async (req, res) => {
  const listing = platformStore.getListing(req.params.listingId);
  if (!listing || listing.saleMode !== 'auction') {
    res.status(404).json({ error: 'Auction not found' });
    return;
  }

  const bids = await tradeStore.listBids(listing.id);
  const { sellerId: _sellerId, ...publicListing } = listing;
  res.json({
    listing: { ...publicListing, isLive: isAuctionLive(listing) },
    bids,
  });
});

auctionsRouter.post('/:listingId/bids', requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = bidSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid bid payload' });
    return;
  }

  try {
    const result = await tradeStore.placeBid({
      listingId: req.params.listingId,
      bidderId: req.user!.id,
      bidderName: req.user!.name,
      amount: parsed.data.amount,
    });
    res.status(201).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to place bid';
    res.status(400).json({ error: message });
  }
});
