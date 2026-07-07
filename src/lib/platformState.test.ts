import { describe, expect, it } from 'vitest';
import type { Order } from '../types';
import { calculatePayoutSummary, deriveListingRiskScore } from './platformState';

function makeOrder(status: Order['status'], total: number): Order {
  return {
    id: `order-${status}`,
    status,
    paymentStatus: status === 'refunded' ? 'refunded' : 'paid',
    total,
    deliveryAddress: 'Cape Town',
    receiptNumber: 'GS-TEST',
    createdAt: 'Today',
    lines: [],
  };
}

describe('platform state helpers', () => {
  it('keeps listing risk bounded by inventory', () => {
    expect(deriveListingRiskScore(0)).toBe(35);
    expect(deriveListingRiskScore(3)).toBe(20);
    expect(deriveListingRiskScore(100)).toBe(3);
  });

  it('calculates available and pending seller payouts net of platform fee', () => {
    const summary = calculatePayoutSummary([
      makeOrder('paid', 1000),
      makeOrder('delivered', 500),
      makeOrder('processing', 200),
      makeOrder('refunded', 900),
    ]);

    expect(summary.available).toBe(1320);
    expect(summary.pending).toBe(176);
  });
});
