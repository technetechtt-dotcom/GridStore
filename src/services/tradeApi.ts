import type { AuctionBid, HaggleOffer, SellerListing } from '../types';
import { platformFetch } from './platformApi';

export async function apiSubmitOffer(input: {
  listingId: string;
  amount: number;
  message?: string;
}) {
  return platformFetch<HaggleOffer>('/offers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function apiGetMyOffers() {
  return platformFetch<HaggleOffer[]>('/offers/mine');
}

export async function apiGetIncomingOffers() {
  return platformFetch<HaggleOffer[]>('/offers/incoming');
}

export async function apiGetListingOffers(listingId: string) {
  return platformFetch<HaggleOffer[]>(`/offers/listing/${encodeURIComponent(listingId)}`);
}

export async function apiRespondToOffer(
  offerId: string,
  action: 'accept' | 'decline' | 'counter',
  counterAmount?: number
) {
  return platformFetch<HaggleOffer>(`/offers/${encodeURIComponent(offerId)}/respond`, {
    method: 'PATCH',
    body: JSON.stringify({ action, counterAmount }),
  });
}

export async function apiGetAuctions() {
  return platformFetch<SellerListing[]>('/auctions', { auth: false });
}

export async function apiGetAuctionDetail(listingId: string) {
  return platformFetch<{ listing: SellerListing & { isLive?: boolean }; bids: AuctionBid[] }>(
    `/auctions/${encodeURIComponent(listingId)}`,
    { auth: false }
  );
}

export async function apiPlaceBid(listingId: string, amount: number) {
  return platformFetch<{ bid: AuctionBid; listing: SellerListing }>(
    `/auctions/${encodeURIComponent(listingId)}/bids`,
    {
      method: 'POST',
      body: JSON.stringify({ amount }),
    }
  );
}
