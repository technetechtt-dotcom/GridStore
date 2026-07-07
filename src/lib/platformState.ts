import type { Order } from '../types';

export function deriveListingRiskScore(inventory: number) {
  return Math.max(3, Math.min(35, Math.round(60 / Math.max(inventory, 1))));
}

export function calculatePayoutSummary(orders: Order[]) {
  return {
    available: orders
      .filter((order) => order.status === 'delivered' || order.status === 'paid')
      .reduce((sum, order) => sum + order.total * 0.88, 0),
    pending: orders
      .filter((order) => order.status === 'pending_payment' || order.status === 'processing')
      .reduce((sum, order) => sum + order.total * 0.88, 0),
  };
}

