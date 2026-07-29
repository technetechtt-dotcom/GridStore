import { createId } from './ids.js';
import { hasDatabase, requireSql } from '../db/client.js';
import { platformStore } from '../store/index.js';
import type { SellerListing, AuctionBid } from '../types.js';
import { resolveAuctionClose } from './auctionTrade.js';
import { recordSecurityEvent } from './security.js';

export interface AuctionResult {
  id: string;
  listingId: string;
  winnerId?: string;
  winningBidCents?: number;
  outcome: 'sold' | 'reserve_not_met' | 'no_bids';
  orderId?: string;
  createdAt: string;
}

const memoryResults = new Map<string, AuctionResult>();

async function persistResult(result: AuctionResult) {
  memoryResults.set(result.listingId, result);
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_auction_results (
      id, listing_id, winner_id, winning_bid_cents, outcome, order_id, created_at
    ) VALUES (
      ${result.id}, ${result.listingId}, ${result.winnerId ?? null},
      ${result.winningBidCents ?? null}, ${result.outcome}, ${result.orderId ?? null}, ${result.createdAt}
    )
    ON CONFLICT (listing_id) DO NOTHING
  `;
}

export async function getAuctionResult(listingId: string) {
  const cached = memoryResults.get(listingId);
  if (cached) return cached;
  if (!hasDatabase()) return undefined;
  const db = requireSql();
  const rows = (await db`
    SELECT * FROM gridstore_auction_results WHERE listing_id = ${listingId} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  const row = rows[0];
  const result: AuctionResult = {
    id: String(row.id),
    listingId: String(row.listing_id),
    winnerId: row.winner_id ? String(row.winner_id) : undefined,
    winningBidCents: row.winning_bid_cents != null ? Number(row.winning_bid_cents) : undefined,
    outcome: String(row.outcome) as AuctionResult['outcome'],
    orderId: row.order_id ? String(row.order_id) : undefined,
    createdAt: String(row.created_at),
  };
  memoryResults.set(listingId, result);
  return result;
}

export async function settleClosedAuction(listing: SellerListing, topBid?: AuctionBid | null) {
  const existing = await getAuctionResult(listing.id);
  if (existing) return existing;

  const resolved = resolveAuctionClose(listing, topBid);
  const createdAt = new Date().toISOString();
  let orderId: string | undefined;
  let outcome: AuctionResult['outcome'] = resolved.outcome === 'sold' ? 'sold' : 'reserve_not_met';
  if (!topBid) outcome = 'no_bids';

  await platformStore.updateListingTradeFields(listing.id, {
    auctionStatus: 'ended',
    auctionWinnerId: resolved.winnerId,
  });

  if (resolved.outcome === 'sold' && resolved.winnerId && topBid) {
    const winner = platformStore.getUserById(resolved.winnerId);
    const order = await platformStore.createOrder(resolved.winnerId, {
      deliveryAddress: winner?.email
        ? `Auction win — confirm delivery address (${winner.email})`
        : 'Auction win — confirm delivery address',
      paymentMethod: 'paystack',
      lines: [{ productId: listing.id, quantity: 1 }],
      idempotencyKey: `auction-win-${listing.id}`,
      auctionWinAmount: topBid.amount,
    });
    orderId = order.id;
    await platformStore.updateListingTradeFields(listing.id, {
      auctionStatus: 'ended',
      auctionWinnerId: resolved.winnerId,
      winningOrderId: orderId,
    });

    const { sendTransactionalEmail } = await import('./authSecurity.js');
    const { env } = await import('../config/env.js');
    if (winner?.email) {
      await sendTransactionalEmail({
        to: winner.email,
        subject: `You won the auction: ${listing.title}`,
        body: `Congratulations! You won "${listing.title}" for R ${topBid.amount.toLocaleString('en-ZA')}.\n\nComplete payment for order ${order.receiptNumber} at ${env.publicWebUrl}/orders.\n\nOrder ID: ${order.id}`,
      });
    }

    recordSecurityEvent('auction.settled', {
      actorId: resolved.winnerId,
      targetId: listing.id,
      detail: { orderId, amount: topBid.amount },
    });
  }

  const result: AuctionResult = {
    id: createId('ares'),
    listingId: listing.id,
    winnerId: resolved.winnerId,
    winningBidCents: topBid ? Math.round(topBid.amount * 100) : undefined,
    outcome,
    orderId,
    createdAt,
  };
  await persistResult(result);
  return result;
}

export function resetAuctionResultsForTests() {
  memoryResults.clear();
}
