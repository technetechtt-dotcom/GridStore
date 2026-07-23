import { createId, nowLabel } from '../../lib/ids.js';
import {
  assertBidAmount,
  assertBidderCanBid,
  assertBuyerCanOffer,
  assertOfferActionable,
  extendedAuctionEndsAt,
  isOfferExpired,
  offerExpiryIso,
  resolveAuctionClose,
  shouldExtendAuctionForAntiSnipe,
} from '../../lib/auctionTrade.js';
import { isAuctionLive } from '../../lib/listingSale.js';
import { platformStore } from '../index.js';
import type { AuctionBid, HaggleOffer } from '../../types.js';
import type { TradeStore } from './types.js';

export class MemoryTradeStore implements TradeStore {
  private offers: HaggleOffer[] = [];
  private bids: AuctionBid[] = [];
  private bidIdempotency = new Map<string, { bid: AuctionBid; listingId: string }>();

  async ensureSeeded() {
    return;
  }

  private expireOffers() {
    for (const offer of this.offers) {
      if (offer.status === 'pending' || offer.status === 'countered') {
        if (isOfferExpired(offer)) {
          offer.status = 'expired';
        }
      }
    }
  }

  async createOffer(input: {
    listingId: string;
    listingTitle: string;
    buyerId: string;
    buyerName: string;
    amount: number;
    message?: string;
  }) {
    this.expireOffers();
    const listing = platformStore.getListing(input.listingId);
    if (!listing) throw new Error('Listing not found');
    assertBuyerCanOffer(listing, input.buyerId);
    if (!listing.haggleEnabled && listing.saleMode !== 'haggle') {
      throw new Error('Haggle is not enabled for this listing');
    }
    if (input.amount <= 0) throw new Error('Offer must be greater than zero');
    if (input.amount >= listing.price) {
      throw new Error('Offer must be below the asking price — use Buy Now instead');
    }

    const offer: HaggleOffer = {
      id: createId('offer'),
      listingId: input.listingId,
      listingTitle: input.listingTitle,
      buyerId: input.buyerId,
      buyerName: input.buyerName,
      amount: input.amount,
      message: input.message?.trim(),
      status: 'pending',
      createdAt: nowLabel(),
      expiresAt: offerExpiryIso(),
    };
    this.offers.unshift(offer);
    return offer;
  }

  async listOffersForListing(listingId: string) {
    this.expireOffers();
    return this.offers.filter((offer) => offer.listingId === listingId);
  }

  async listOffersForBuyer(buyerId: string) {
    this.expireOffers();
    return this.offers.filter((offer) => offer.buyerId === buyerId);
  }

  async listOffersForSeller(sellerId: string) {
    this.expireOffers();
    const listingIds = new Set(
      platformStore.listSellerListings(sellerId).map((listing) => listing.id)
    );
    return this.offers.filter((offer) => listingIds.has(offer.listingId));
  }

  async respondToOffer(
    offerId: string,
    sellerId: string,
    action: 'accept' | 'decline' | 'counter',
    counterAmount?: number
  ) {
    this.expireOffers();
    const offer = this.offers.find((item) => item.id === offerId);
    if (!offer) throw new Error('Offer not found');

    const listing = platformStore.getListing(offer.listingId);
    if (!listing || listing.sellerId !== sellerId) {
      throw new Error('Not authorized to respond to this offer');
    }
    assertOfferActionable(offer);

    if (action === 'accept') {
      if (listing.inventory < 1) {
        throw new Error('Insufficient inventory to accept offer');
      }
      offer.status = 'accepted';
      offer.inventoryReserved = true;
      await platformStore.updateListing(listing.sellerId, listing.id, {
        inventory: listing.inventory - 1,
      });
      for (const competing of this.offers) {
        if (
          competing.listingId === offer.listingId &&
          competing.id !== offer.id &&
          (competing.status === 'pending' || competing.status === 'countered')
        ) {
          competing.status = 'declined';
        }
      }
    } else if (action === 'decline') {
      offer.status = 'declined';
    } else {
      if (!counterAmount || counterAmount <= 0) {
        throw new Error('Counter amount is required');
      }
      offer.status = 'countered';
      offer.counterAmount = counterAmount;
      offer.expiresAt = offerExpiryIso();
    }

    return offer;
  }

  async placeBid(input: {
    listingId: string;
    bidderId: string;
    bidderName: string;
    amount: number;
    idempotencyKey?: string;
  }) {
    await this.closeExpiredAuctions();

    if (input.idempotencyKey) {
      const existing = this.bidIdempotency.get(`${input.bidderId}:${input.idempotencyKey}`);
      if (existing) {
        const listing = platformStore.getListing(existing.listingId);
        if (!listing) throw new Error('Listing not found');
        return { bid: existing.bid, listing };
      }
    }

    const listing = platformStore.getListing(input.listingId);
    if (!listing) throw new Error('Listing not found');
    assertBidderCanBid(listing, input.bidderId);
    assertBidAmount(listing, input.amount);

    const bid: AuctionBid = {
      id: createId('bid'),
      listingId: input.listingId,
      bidderId: input.bidderId,
      bidderName: input.bidderName,
      amount: input.amount,
      createdAt: nowLabel(),
      idempotencyKey: input.idempotencyKey,
    };
    this.bids.unshift(bid);

    const patch: {
      currentBid: number;
      bidCount: number;
      auctionEndsAt?: string;
    } = {
      currentBid: input.amount,
      bidCount: (listing.bidCount ?? 0) + 1,
    };

    if (shouldExtendAuctionForAntiSnipe(listing)) {
      patch.auctionEndsAt = extendedAuctionEndsAt(listing);
    }

    const updated = await platformStore.updateListingTradeFields(input.listingId, patch);
    if (input.idempotencyKey) {
      this.bidIdempotency.set(`${input.bidderId}:${input.idempotencyKey}`, {
        bid,
        listingId: input.listingId,
      });
    }

    return { bid, listing: updated };
  }

  async listBids(listingId: string) {
    return this.bids
      .filter((bid) => bid.listingId === listingId)
      .sort((a, b) => b.amount - a.amount || b.createdAt.localeCompare(a.createdAt));
  }

  async closeExpiredAuctions() {
    const auctions = platformStore
      .listAllAuctionsAdmin()
      .filter((listing) => listing.auctionStatus === 'live');

    for (const listing of auctions) {
      if (isAuctionLive(listing)) continue;
      const topBid = (await this.listBids(listing.id))[0] ?? null;
      const result = resolveAuctionClose(listing, topBid);
      await platformStore.updateListingTradeFields(listing.id, {
        auctionStatus: result.auctionStatus,
      });
    }
  }
}
