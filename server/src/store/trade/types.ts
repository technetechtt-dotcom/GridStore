import type { AuctionBid, HaggleOffer } from '../types.js';

export interface TradeStore {
  ensureSeeded(): Promise<void>;
  createOffer(input: {
    listingId: string;
    listingTitle: string;
    buyerId: string;
    buyerName: string;
    amount: number;
    message?: string;
  }): Promise<HaggleOffer>;
  listOffersForListing(listingId: string): Promise<HaggleOffer[]>;
  listOffersForBuyer(buyerId: string): Promise<HaggleOffer[]>;
  listOffersForSeller(sellerId: string): Promise<HaggleOffer[]>;
  respondToOffer(
    offerId: string,
    sellerId: string,
    action: 'accept' | 'decline' | 'counter',
    counterAmount?: number
  ): Promise<HaggleOffer>;
  placeBid(input: {
    listingId: string;
    bidderId: string;
    bidderName: string;
    amount: number;
  }): Promise<{ bid: AuctionBid; listing: import('../types.js').SellerListing }>;
  listBids(listingId: string): Promise<AuctionBid[]>;
}
