import { requireSql } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import { createId, nowLabel } from '../../lib/ids.js';
import { isAuctionLive, minimumBidAmount } from '../../lib/listingSale.js';
import { platformStore } from '../index.js';
import type { AuctionBid, HaggleOffer } from '../../types.js';
import type { TradeStore } from './types.js';

function mapOffer(row: Record<string, string | number | null>): HaggleOffer {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    listingTitle: String(row.listing_title),
    buyerId: String(row.buyer_id),
    buyerName: String(row.buyer_name),
    amount: Number(row.amount),
    message: row.message ? String(row.message) : undefined,
    status: String(row.status) as HaggleOffer['status'],
    counterAmount: row.counter_amount ? Number(row.counter_amount) : undefined,
    createdAt: String(row.created_at),
  };
}

function mapBid(row: Record<string, string | number>): AuctionBid {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    bidderId: String(row.bidder_id),
    bidderName: String(row.bidder_name),
    amount: Number(row.amount),
    createdAt: String(row.created_at),
  };
}

export class PostgresTradeStore implements TradeStore {
  private ready = false;

  async ensureSeeded() {
    if (this.ready) return;
    await migrate();
    this.ready = true;
  }

  async createOffer(input: {
    listingId: string;
    listingTitle: string;
    buyerId: string;
    buyerName: string;
    amount: number;
    message?: string;
  }) {
    await this.ensureSeeded();
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

    const db = requireSql();
    await db`
      INSERT INTO gridstore_offers (
        id, listing_id, listing_title, buyer_id, buyer_name, amount, message, status, created_at
      ) VALUES (
        ${offer.id}, ${offer.listingId}, ${offer.listingTitle}, ${offer.buyerId},
        ${offer.buyerName}, ${offer.amount}, ${offer.message ?? null}, ${offer.status}, ${offer.createdAt}
      )
    `;
    return offer;
  }

  async listOffersForListing(listingId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_offers WHERE listing_id = ${listingId} ORDER BY created_at DESC
    `) as Record<string, string | number | null>[];
    return rows.map(mapOffer);
  }

  async listOffersForBuyer(buyerId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_offers WHERE buyer_id = ${buyerId} ORDER BY created_at DESC
    `) as Record<string, string | number | null>[];
    return rows.map(mapOffer);
  }

  async listOffersForSeller(sellerId: string) {
    await this.ensureSeeded();
    const listingIds = platformStore.listSellerListings(sellerId).map((listing) => listing.id);
    if (!listingIds.length) return [];

    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_offers
      WHERE listing_id = ANY(${listingIds})
      ORDER BY created_at DESC
    `) as Record<string, string | number | null>[];
    return rows.map(mapOffer);
  }

  async respondToOffer(
    offerId: string,
    sellerId: string,
    action: 'accept' | 'decline' | 'counter',
    counterAmount?: number
  ) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`SELECT * FROM gridstore_offers WHERE id = ${offerId}`) as Record<
      string,
      string | number | null
    >[];
    if (!rows.length) throw new Error('Offer not found');
    const offer = mapOffer(rows[0]!);

    const listing = platformStore.getListing(offer.listingId);
    if (!listing || listing.sellerId !== sellerId) {
      throw new Error('Not authorized to respond to this offer');
    }

    let status: HaggleOffer['status'] = offer.status;
    let counter: number | null = offer.counterAmount ?? null;

    if (action === 'accept') status = 'accepted';
    else if (action === 'decline') status = 'declined';
    else {
      if (!counterAmount || counterAmount <= 0) throw new Error('Counter amount is required');
      status = 'countered';
      counter = counterAmount;
    }

    await db`
      UPDATE gridstore_offers
      SET status = ${status}, counter_amount = ${counter}
      WHERE id = ${offerId}
    `;

    return { ...offer, status, counterAmount: counter ?? undefined };
  }

  async placeBid(input: {
    listingId: string;
    bidderId: string;
    bidderName: string;
    amount: number;
  }) {
    await this.ensureSeeded();
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

    const db = requireSql();
    await db`
      INSERT INTO gridstore_bids (id, listing_id, bidder_id, bidder_name, amount, created_at)
      VALUES (${bid.id}, ${bid.listingId}, ${bid.bidderId}, ${bid.bidderName}, ${bid.amount}, ${bid.createdAt})
    `;

    const updated = await platformStore.updateListingTradeFields(input.listingId, {
      currentBid: input.amount,
      bidCount: (listing.bidCount ?? 0) + 1,
    });

    return { bid, listing: updated };
  }

  async listBids(listingId: string) {
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_bids WHERE listing_id = ${listingId} ORDER BY created_at DESC
    `) as Record<string, string | number>[];
    return rows.map(mapBid);
  }
}
