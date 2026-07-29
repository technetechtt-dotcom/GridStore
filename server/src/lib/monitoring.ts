import { listSecurityEvents } from './security.js';
import { listPayments } from './payments.js';
import { accountBalanceCents, listLedgerJournals, validateLedgerIntegrity } from './ledger.js';
import { platformStore } from '../store/index.js';

export interface MonitoringSnapshot {
  generatedAt: string;
  counts: {
    stuckPendingOrders: number;
    pendingPayments: number;
    failedPayments: number;
    recentAuthFailures: number;
    ledgerJournals: number;
    sellerPayableCents: number;
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

  const recentAuthFailures = listSecurityEvents(200).filter(
    (event) =>
      event.type.includes('auth.') &&
      (event.type.includes('fail') || event.type.includes('lock')) &&
      Date.now() - new Date(event.createdAt).getTime() < 60 * 60 * 1000
  ).length;

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

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      stuckPendingOrders,
      pendingPayments,
      failedPayments,
      recentAuthFailures,
      ledgerJournals: listLedgerJournals().length,
      sellerPayableCents: accountBalanceCents('seller_payable'),
    },
    alerts,
  };
}
