import type { AuctionBid, HaggleOffer, SellerListing } from '../types.js';
import { isAuctionLive, minimumBidAmount } from './listingSale.js';

export const OFFER_TTL_MS = 48 * 60 * 60 * 1000;
export const ANTI_SNIPE_WINDOW_MS = 2 * 60 * 1000;
export const ANTI_SNIPE_EXTENSION_MS = 2 * 60 * 1000;

export function offerExpiryIso(fromMs = Date.now()) {
  return new Date(fromMs + OFFER_TTL_MS).toISOString();
}

export function isOfferExpired(offer: Pick<HaggleOffer, 'expiresAt' | 'status'>, now = Date.now()) {
  if (offer.status !== 'pending' && offer.status !== 'countered') return false;
  if (!offer.expiresAt) return false;
  return new Date(offer.expiresAt).getTime() <= now;
}

export function assertBuyerCanOffer(listing: SellerListing, buyerId: string) {
  if (listing.sellerId === buyerId) {
    throw new Error('Sellers cannot make offers on their own listings');
  }
  if (listing.status !== 'active') {
    throw new Error('Listing is not available for offers');
  }
}

export function assertBidderCanBid(listing: SellerListing, bidderId: string) {
  if (listing.sellerId === bidderId) {
    throw new Error('Sellers cannot bid on their own auctions');
  }
  if (listing.status !== 'active') {
    throw new Error('Auction listing is not active');
  }
  if (listing.saleMode !== 'auction') {
    throw new Error('This listing is not an auction');
  }
  if (!isAuctionLive(listing)) {
    throw new Error('This auction has ended');
  }
}

export function assertBidAmount(listing: SellerListing, amount: number) {
  const minBid = minimumBidAmount(listing);
  if (amount < minBid) {
    throw new Error(`Minimum bid is R ${minBid.toLocaleString('en-ZA')}`);
  }
}

export function shouldExtendAuctionForAntiSnipe(listing: SellerListing, now = Date.now()) {
  if (!listing.auctionEndsAt) return false;
  const endsAt = new Date(listing.auctionEndsAt).getTime();
  return endsAt - now <= ANTI_SNIPE_WINDOW_MS && endsAt > now;
}

export function extendedAuctionEndsAt(listing: SellerListing, now = Date.now()) {
  const current = listing.auctionEndsAt ? new Date(listing.auctionEndsAt).getTime() : now;
  return new Date(Math.max(current, now) + ANTI_SNIPE_EXTENSION_MS).toISOString();
}

export function reserveMet(listing: SellerListing) {
  if (listing.reservePrice == null) return true;
  return (listing.currentBid ?? 0) >= listing.reservePrice;
}

export function resolveAuctionClose(listing: SellerListing, topBid?: AuctionBid | null) {
  if (!topBid || !reserveMet({ ...listing, currentBid: topBid.amount })) {
    return {
      auctionStatus: 'ended' as const,
      winnerId: undefined as string | undefined,
      outcome: 'reserve_not_met' as const,
    };
  }
  return {
    auctionStatus: 'ended' as const,
    winnerId: topBid.bidderId,
    outcome: 'sold' as const,
  };
}

export function assertOfferActionable(offer: HaggleOffer) {
  if (isOfferExpired(offer)) {
    throw new Error('Offer has expired');
  }
  if (offer.status !== 'pending' && offer.status !== 'countered') {
    throw new Error(`Cannot act on ${offer.status} offer`);
  }
}
