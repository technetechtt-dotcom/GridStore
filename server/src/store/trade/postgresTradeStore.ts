import { requireSql } from '../../db/client.js';
import { migrate } from '../../db/migrate.js';
import { createId, nowLabel } from '../../lib/ids.js';
import { isAuctionLive } from '../../lib/listingSale.js';
import {
  assertBidAmount,
  assertBidderCanBid,
  assertBuyerCanOffer,
  assertOfferActionable,
  extendedAuctionEndsAt,
  offerExpiryIso,
  resolveAuctionClose,
  shouldExtendAuctionForAntiSnipe,
} from '../../lib/auctionTrade.js';
import { platformStore } from '../index.js';
import type { AuctionBid, HaggleOffer } from '../../types.js';
import type { TradeStore } from './types.js';

function mapOffer(row: Record<string, string | number | null | boolean>): HaggleOffer {
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
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    inventoryReserved: Boolean(row.inventory_reserved),
  };
}

function mapBid(row: Record<string, string | number | null>): AuctionBid {
  return {
    id: String(row.id),
    listingId: String(row.listing_id),
    bidderId: String(row.bidder_id),
    bidderName: String(row.bidder_name),
    amount: Number(row.amount),
    createdAt: String(row.created_at),
    idempotencyKey: row.idempotency_key ? String(row.idempotency_key) : undefined,
  };
}

export class PostgresTradeStore implements TradeStore {
  private ready = false;
  private bidIdempotency = new Map<string, { bid: AuctionBid; listingId: string }>();

  async ensureSeeded() {
    if (this.ready) return;
    await migrate();
    this.ready = true;
  }

  private async expireOffers() {
    const db = requireSql();
    await db`
      UPDATE gridstore_offers
      SET status = 'expired'
      WHERE status IN ('pending', 'countered')
        AND expires_at IS NOT NULL
        AND expires_at <= NOW()
    `;
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
    await this.expireOffers();
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

    const db = requireSql();
    await db`
      INSERT INTO gridstore_offers (
        id, listing_id, listing_title, buyer_id, buyer_name, amount, message, status, created_at, expires_at
      ) VALUES (
        ${offer.id}, ${offer.listingId}, ${offer.listingTitle}, ${offer.buyerId},
        ${offer.buyerName}, ${offer.amount}, ${offer.message ?? null}, ${offer.status}, ${offer.createdAt},
        ${offer.expiresAt}
      )
    `;
    return offer;
  }

  async listOffersForListing(listingId: string) {
    await this.ensureSeeded();
    await this.expireOffers();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_offers WHERE listing_id = ${listingId} ORDER BY created_at DESC
    `) as Record<string, string | number | null | boolean>[];
    return rows.map(mapOffer);
  }

  async listOffersForBuyer(buyerId: string) {
    await this.ensureSeeded();
    await this.expireOffers();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_offers WHERE buyer_id = ${buyerId} ORDER BY created_at DESC
    `) as Record<string, string | number | null | boolean>[];
    return rows.map(mapOffer);
  }

  async listOffersForSeller(sellerId: string) {
    await this.ensureSeeded();
    await this.expireOffers();
    const listingIds = platformStore.listSellerListings(sellerId).map((listing) => listing.id);
    if (!listingIds.length) return [];

    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_offers
      WHERE listing_id = ANY(${listingIds})
      ORDER BY created_at DESC
    `) as Record<string, string | number | null | boolean>[];
    return rows.map(mapOffer);
  }

  async respondToOffer(
    offerId: string,
    sellerId: string,
    action: 'accept' | 'decline' | 'counter',
    counterAmount?: number
  ) {
    await this.ensureSeeded();
    await this.expireOffers();
    const db = requireSql();
    const rows = (await db`SELECT * FROM gridstore_offers WHERE id = ${offerId}`) as Record<
      string,
      string | number | null | boolean
    >[];
    if (!rows.length) throw new Error('Offer not found');
    const offer = mapOffer(rows[0]!);

    const listing = platformStore.getListing(offer.listingId);
    if (!listing || listing.sellerId !== sellerId) {
      throw new Error('Not authorized to respond to this offer');
    }
    assertOfferActionable(offer);

    let status: HaggleOffer['status'] = offer.status;
    let counter: number | null = offer.counterAmount ?? null;
    let inventoryReserved = Boolean(offer.inventoryReserved);
    let expiresAt = offer.expiresAt ?? null;

    if (action === 'accept') {
      if (listing.inventory < 1) throw new Error('Insufficient inventory to accept offer');
      status = 'accepted';
      inventoryReserved = true;
      await platformStore.updateListing(listing.sellerId, listing.id, {
        inventory: listing.inventory - 1,
      });
      await db`
        UPDATE gridstore_offers
        SET status = 'declined'
        WHERE listing_id = ${offer.listingId}
          AND id <> ${offerId}
          AND status IN ('pending', 'countered')
      `;
    } else if (action === 'decline') {
      status = 'declined';
    } else {
      if (!counterAmount || counterAmount <= 0) throw new Error('Counter amount is required');
      status = 'countered';
      counter = counterAmount;
      expiresAt = offerExpiryIso();
    }

    await db`
      UPDATE gridstore_offers
      SET status = ${status},
          counter_amount = ${counter},
          inventory_reserved = ${inventoryReserved},
          expires_at = ${expiresAt}
      WHERE id = ${offerId}
    `;

    return {
      ...offer,
      status,
      counterAmount: counter ?? undefined,
      inventoryReserved,
      expiresAt: expiresAt ?? undefined,
    };
  }

  async placeBid(input: {
    listingId: string;
    bidderId: string;
    bidderName: string;
    amount: number;
    idempotencyKey?: string;
  }) {
    await this.ensureSeeded();
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

    const db = requireSql();
    await db`
      INSERT INTO gridstore_bids (id, listing_id, bidder_id, bidder_name, amount, created_at, idempotency_key)
      VALUES (
        ${bid.id}, ${bid.listingId}, ${bid.bidderId}, ${bid.bidderName}, ${bid.amount},
        ${bid.createdAt}, ${bid.idempotencyKey ?? null}
      )
    `;

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
    await this.ensureSeeded();
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_bids WHERE listing_id = ${listingId} ORDER BY amount DESC, created_at DESC
    `) as Record<string, string | number | null>[];
    return rows.map(mapBid);
  }

  async closeExpiredAuctions() {
    await this.ensureSeeded();
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
