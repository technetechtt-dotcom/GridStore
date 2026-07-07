import type { ListingInput } from '../store/storeTypes.js';
import type { SellerListing } from '../types.js';

export function resolveSaleFields(input: ListingInput): Pick<
  SellerListing,
  | 'saleMode'
  | 'haggleEnabled'
  | 'startingBid'
  | 'currentBid'
  | 'bidIncrement'
  | 'reservePrice'
  | 'auctionEndsAt'
  | 'auctionStatus'
  | 'bidCount'
> {
  const saleMode =
    input.saleMode ?? (input.haggleEnabled ? 'haggle' : input.startingBid !== undefined ? 'auction' : 'fixed');
  const isAuction = saleMode === 'auction';
  const isHaggle = saleMode === 'haggle' || Boolean(input.haggleEnabled);
  const durationHours = input.auctionDurationHours ?? 72;

  return {
    saleMode: isAuction ? 'auction' : isHaggle ? 'haggle' : 'fixed',
    haggleEnabled: isHaggle,
    startingBid: isAuction ? (input.startingBid ?? input.price) : undefined,
    currentBid: isAuction ? 0 : undefined,
    bidIncrement: isAuction ? (input.bidIncrement ?? 50) : undefined,
    reservePrice: isAuction ? input.reservePrice : undefined,
    auctionEndsAt: isAuction
      ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString()
      : undefined,
    auctionStatus: isAuction ? 'live' : 'none',
    bidCount: 0,
  };
}

export function isAuctionLive(listing: SellerListing) {
  if (listing.saleMode !== 'auction' || listing.auctionStatus !== 'live') return false;
  if (!listing.auctionEndsAt) return true;
  return new Date(listing.auctionEndsAt).getTime() > Date.now();
}

export function minimumBidAmount(listing: SellerListing) {
  const increment = listing.bidIncrement ?? 50;
  const floor = listing.startingBid ?? listing.price;
  if (!listing.currentBid || listing.currentBid <= 0) return floor;
  return listing.currentBid + increment;
}
