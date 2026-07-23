import type { Order, OrderEvent, OrderLine, SellerListing } from '../types.js';
import { createId } from './ids.js';

export const RESERVATION_TTL_MS = 15 * 60 * 1000;

export type CheckoutLineInput = { productId: string; quantity: number };

export type InventoryReservation = {
  id: string;
  orderId: string;
  listingId: string;
  quantity: number;
  status: 'held' | 'committed' | 'released' | 'expired';
  expiresAt: string;
  createdAt: string;
};

export type InventoryAdjustment = {
  id: string;
  listingId: string;
  delta: number;
  reason: string;
  orderId?: string;
  actorId?: string;
  createdAt: string;
};

/** Catalog prices are whole rands; commerce math uses integer cents. */
export function randsToCents(rands: number): number {
  return Math.round(Number(rands) * 100);
}

export function centsToRands(cents: number): number {
  return Math.round(cents) / 100;
}

export function isPurchasableListing(listing: SellerListing): boolean {
  if (listing.status !== 'active') return false;
  if (listing.saleMode === 'auction') return false;
  if (listing.auctionStatus === 'live') return false;
  return true;
}

export function assertPurchasableListing(listing: SellerListing | undefined, productId: string): SellerListing {
  if (!listing) {
    throw new Error(`Listing not found: ${productId}`);
  }
  if (listing.status === 'paused') {
    throw new Error(`Listing is paused: ${listing.title}`);
  }
  if (listing.status === 'flagged') {
    throw new Error(`Listing is flagged and unavailable: ${listing.title}`);
  }
  if (listing.status === 'draft' || listing.status !== 'active') {
    throw new Error(`Listing is not available for purchase: ${listing.title}`);
  }
  if (listing.saleMode === 'auction' || listing.auctionStatus === 'live') {
    throw new Error(`Auction listings cannot be purchased through checkout: ${listing.title}`);
  }
  return listing;
}

export function buildAuthoritativeLines(
  inputs: CheckoutLineInput[],
  resolveListing: (productId: string) => SellerListing | undefined
): { lines: OrderLine[]; totalCents: number } {
  if (!inputs.length) {
    throw new Error('Cart is empty');
  }

  const merged = new Map<string, number>();
  for (const line of inputs) {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error('Quantity must be a positive integer');
    }
    merged.set(line.productId, (merged.get(line.productId) ?? 0) + line.quantity);
  }

  const lines: OrderLine[] = [];
  let totalCents = 0;

  for (const [productId, quantity] of merged) {
    const listing = assertPurchasableListing(resolveListing(productId), productId);
    const unitPriceCents = randsToCents(listing.price);
    totalCents += unitPriceCents * quantity;
    lines.push({
      productId: listing.id,
      title: listing.title,
      seller: listing.seller,
      sellerId: listing.sellerId,
      quantity,
      unitPrice: centsToRands(unitPriceCents),
      unitPriceCents,
    });
  }

  return { lines, totalCents };
}

const BUYER_CANCEL_FROM = new Set<Order['status']>(['pending_payment']);
const REFUND_FROM = new Set<Order['status']>(['paid', 'processing', 'shipped', 'delivered']);

export type OrderTransitionAction =
  | 'confirm_payment'
  | 'start_processing'
  | 'ship'
  | 'deliver'
  | 'cancel'
  | 'refund';

export function assertOrderTransition(
  order: Order,
  action: OrderTransitionAction,
  actor: { role: string; userId: string }
): { status: Order['status']; paymentStatus?: Order['paymentStatus'] } {
  switch (action) {
    case 'confirm_payment': {
      if (!['admin', 'moderator'].includes(actor.role)) {
        throw new Error('Only staff can confirm payment');
      }
      if (order.status !== 'pending_payment') {
        throw new Error('Only pending orders can be marked paid');
      }
      return { status: 'paid', paymentStatus: 'paid' };
    }
    case 'start_processing': {
      if (!['admin', 'moderator', 'seller'].includes(actor.role)) {
        throw new Error('Not allowed to start processing');
      }
      if (order.status !== 'paid') {
        throw new Error('Only paid orders can move to processing');
      }
      return { status: 'processing' };
    }
    case 'ship': {
      if (!['admin', 'moderator', 'seller'].includes(actor.role)) {
        throw new Error('Not allowed to ship orders');
      }
      if (order.status !== 'processing' && order.status !== 'paid') {
        throw new Error('Order must be paid or processing before shipping');
      }
      return { status: 'shipped' };
    }
    case 'deliver': {
      if (!['admin', 'moderator', 'seller'].includes(actor.role) && actor.userId !== order.userId) {
        throw new Error('Not allowed to mark delivered');
      }
      if (order.status !== 'shipped') {
        throw new Error('Only shipped orders can be marked delivered');
      }
      return { status: 'delivered' };
    }
    case 'cancel': {
      if (actor.userId !== order.userId && !['admin', 'moderator'].includes(actor.role)) {
        throw new Error('Not allowed to cancel this order');
      }
      if (!BUYER_CANCEL_FROM.has(order.status)) {
        throw new Error('Only unpaid orders can be cancelled');
      }
      return { status: 'cancelled', paymentStatus: order.paymentStatus };
    }
    case 'refund': {
      if (actor.userId !== order.userId && !['admin', 'moderator'].includes(actor.role)) {
        throw new Error('Not allowed to refund this order');
      }
      if (!REFUND_FROM.has(order.status)) {
        throw new Error('Order cannot be refunded from its current status');
      }
      return { status: 'refunded', paymentStatus: 'refunded' };
    }
    default:
      throw new Error('Unknown transition');
  }
}

export function createOrderEvent(input: {
  orderId: string;
  type: string;
  actorId?: string;
  fromStatus?: Order['status'];
  toStatus?: Order['status'];
  detail?: Record<string, unknown>;
}): OrderEvent {
  return {
    id: createId('oevt'),
    orderId: input.orderId,
    type: input.type,
    actorId: input.actorId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    detail: input.detail,
    createdAt: new Date().toISOString(),
  };
}

export function reservationExpiryIso(fromMs = Date.now()): string {
  return new Date(fromMs + RESERVATION_TTL_MS).toISOString();
}
