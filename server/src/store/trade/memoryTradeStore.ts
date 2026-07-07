import { createId, nowLabel } from '../../lib/ids.js';
import { isAuctionLive, minimumBidAmount } from '../../lib/listingSale.js';
import { platformStore } from '../index.js';
import type { AuctionBid, HaggleOffer } from '../../types.js';
import type { TradeStore } from './types.js';

export class MemoryTradeStore implements TradeStore {
  private offers: HaggleOffer[] = [];
  private bids: AuctionBid[] = [];

  async ensureSeeded() {
    return;
  }

  async createOffer(input: {
    listingId: string;
    listingTitle: string;
    buyerId: string;
    buyerName: string;
    amount: number;
    message?: string;
  }) {
    const listing = platformStore.getListing(input.listingId);
    if (!listing) throw new Error('Listing not found');
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
    };
    this.offers.unshift(offer);
    return offer;
  }

  async listOffersForListing(listingId: string) {
    return this.offers.filter((offer) => offer.listingId === listingId);
  }

  async listOffersForBuyer(buyerId: string) {
    return this.offers.filter((offer) => offer.buyerId === buyerId);
  }

  async listOffersForSeller(sellerId: string) {
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
    const offer = this.offers.find((item) => item.id === offerId);
    if (!offer) throw new Error('Offer not found');

    const listing = platformStore.getListing(offer.listingId);
    if (!listing || listing.sellerId !== sellerId) {
      throw new Error('Not authorized to respond to this offer');
    }

    if (action === 'accept') {
      offer.status = 'accepted';
    } else if (action === 'decline') {
      offer.status = 'declined';
    } else {
      if (!counterAmount || counterAmount <= 0) {
        throw new Error('Counter amount is required');
      }
      offer.status = 'countered';
      offer.counterAmount = counterAmount;
    }

    return offer;
  }

  async placeBid(input: {
    listingId: string;
    bidderId: string;
    bidderName: string;
    amount: number;
  }) {
    const listing = platformStore.getListing(input.listingId);
    if (!listing) throw new Error('Listing not found');
    if (listing.saleMode !== 'auction') throw new Error('This listing is not an auction');
    if (!isAuctionLive(listing)) throw new Error('This auction has ended');

    const minBid = minimumBidAmount(listing);
    if (input.amount < minBid) {
      throw new Error(`Minimum bid is R ${minBid.toLocaleString('en-ZA')}`);
    }

    const bid: AuctionBid = {
      id: createId('bid'),
      listingId: input.listingId,
      bidderId: input.bidderId,
      bidderName: input.bidderName,
      amount: input.amount,
      createdAt: nowLabel(),
    };
    this.bids.unshift(bid);

    const updated = await platformStore.updateListingTradeFields(input.listingId, {
      currentBid: input.amount,
      bidCount: (listing.bidCount ?? 0) + 1,
    });

    return { bid, listing: updated };
  }

  async listBids(listingId: string) {
    return this.bids.filter((bid) => bid.listingId === listingId);
  }
}
