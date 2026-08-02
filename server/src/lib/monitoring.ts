import { listSecurityEvents } from './security.js';
import { listPayments } from './payments.js';
import { accountBalanceCents, listLedgerJournals, validateLedgerIntegrity } from './ledger.js';
import { platformStore } from '../store/index.js';
import { listReturns } from './returns.js';
import { listPayouts } from './settlement.js';

export interface MonitoringSnapshot {
  generatedAt: string;
  counts: {
    stuckPendingOrders: number;
    pendingPayments: number;
    failedPayments: number;
    recentAuthFailures: number;
    ledgerJournals: number;
    sellerPayableCents: number;
    openReturns: number;
    failedPayouts: number;
  };
  alerts: string[];
}

export async function collectMonitoringSnapshot(): Promise<MonitoringSnapshot> {
  const alerts: string[] = [];
  const orders = platformStore.listAllOrders();
  const stuckPendingOrders = orders.filter((order) => {
    if (order.status !== 'pending_payment') return false;
    const ageMs = Date.now() - new Date(order.createdAt).getTime();
    return ageMs > 60 * 60 * 1000;
  }).length;

  const payments = await listPayments();
  const pendingPayments = payments.filter((payment) =>
    ['pending', 'authorized'].includes(payment.status)
  ).length;
  const failedPayments = payments.filter((payment) => payment.status === 'failed').length;

  const securityEvents = await listSecurityEvents(200);
  const recentAuthFailures = securityEvents.filter(
    (event) =>
      event.type.includes('auth.') &&
      (event.type.includes('fail') || event.type.includes('lock')) &&
      Date.now() - new Date(event.createdAt).getTime() < 60 * 60 * 1000
  ).length;

  const openReturns = (await listReturns()).filter((item) =>
    ['requested', 'approved', 'item_shipped', 'received'].includes(item.status)
  ).length;
  const failedPayouts = (await listPayouts()).filter((item) => item.status === 'failed').length;

  try {
    await validateLedgerIntegrity();
  } catch (error) {
    alerts.push(error instanceof Error ? error.message : 'Ledger integrity failed');
  }

  for (const payment of payments.filter((item) => item.status === 'captured')) {
    const order = orders.find((item) => item.id === payment.orderId);
    if (order && order.paymentStatus !== 'paid' && order.status === 'pending_payment') {
      alerts.push(`Payment ${payment.id} captured but order ${order.id} not marked paid`);
    }
  }

  if (stuckPendingOrders > 0) alerts.push(`${stuckPendingOrders} orders stuck in pending_payment >1h`);
  if (failedPayments > 5) alerts.push(`${failedPayments} failed payments in store`);
  if (recentAuthFailures > 20) alerts.push(`${recentAuthFailures} auth failures in the last hour`);
  if (openReturns > 10) alerts.push(`${openReturns} open return/RMA cases`);
  if (failedPayouts > 0) alerts.push(`${failedPayouts} failed seller payouts need review`);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      stuckPendingOrders,
      pendingPayments,
      failedPayments,
      recentAuthFailures,
      ledgerJournals: listLedgerJournals().length,
      sellerPayableCents: accountBalanceCents('seller_payable'),
      openReturns,
      failedPayouts,
    },
    alerts,
  };
}
