import { listEmailOutbox } from '../lib/authSecurity.js';
import { listPayments, paymentProvider, verifyWebhookSignature } from '../lib/payments.js';
import { verifyPaystackTransaction, paystackConfigured } from '../lib/paystack.js';
import { collectMonitoringSnapshot } from '../lib/monitoring.js';
import { tradeStore } from '../store/trade/index.js';
import { platformStore } from '../store/index.js';
import { logger, recordSecurityEvent } from '../lib/security.js';
import { claimPendingJobs, completeJob, enqueueJob, failJob, type BackgroundJob } from './queue.js';

async function handleAuctionClose() {
  await tradeStore.closeExpiredAuctions();
}

async function handleReservationExpire() {
  // Touch order inventory paths that expire held reservations.
  for (const order of platformStore.listAllOrders()) {
    if (order.status === 'pending_payment') {
      platformStore.getOrder(order.userId, order.id);
    }
  }
}

async function handlePaymentReconcile() {
  if (paymentProvider() !== 'paystack' || !paystackConfigured()) return;
  const pending = (await listPayments()).filter((payment) =>
    ['pending', 'authorized'].includes(payment.status)
  );
  for (const payment of pending) {
    try {
      const verified = await verifyPaystackTransaction(payment.providerReference);
      if (verified.status === 'success' && verified.amount === payment.amountCents) {
        const { applyVerifiedWebhook } = await import('../services/paymentService.js');
        const { canonicalizeWebhookPayload, signWebhookPayload } = await import('../lib/payments.js');
        const payload = {
          providerEventId: `reconcile_${payment.id}_${verified.paid_at ?? Date.now()}`,
          eventType: 'payment.captured' as const,
          reference: payment.providerReference,
          amountCents: payment.amountCents,
        };
        const rawBody = canonicalizeWebhookPayload(payload);
        await applyVerifiedWebhook({
          rawBody,
          signature: signWebhookPayload(rawBody),
        });
      }
    } catch (error) {
      recordSecurityEvent('payment.reconcile.failed', {
        targetId: payment.id,
        detail: { error: error instanceof Error ? error.message : 'unknown' },
      });
    }
  }
}

async function handleEmailDeliver() {
  const outbox = listEmailOutbox();
  logger.info('Email outbox drain', { queued: outbox.length });
}

async function handleMonitoringScan() {
  const snapshot = await collectMonitoringSnapshot();
  if (snapshot.alerts.length) {
    recordSecurityEvent('monitoring.alerts', {
      detail: { alerts: snapshot.alerts, counts: snapshot.counts },
    });
  }
}

async function runJob(job: BackgroundJob) {
  switch (job.type) {
    case 'auction.close':
      await handleAuctionClose();
      break;
    case 'reservation.expire':
      await handleReservationExpire();
      break;
    case 'payment.reconcile':
      await handlePaymentReconcile();
      break;
    case 'email.deliver':
      await handleEmailDeliver();
      break;
    case 'monitoring.scan':
      await handleMonitoringScan();
      break;
    default:
      throw new Error(`Unknown job type ${(job as BackgroundJob).type}`);
  }
}

export async function processJobQueue(limit = 10) {
  const jobs = await claimPendingJobs(limit);
  for (const job of jobs) {
    try {
      await runJob(job);
      await completeJob(job.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Job failed';
      logger.error('Background job failed', { jobId: job.id, type: job.type, error: message });
      await failJob(job.id, message);
    }
  }
  return jobs.length;
}

let timer: ReturnType<typeof setInterval> | undefined;

export function startBackgroundWorkers() {
  if (timer || process.env.VITEST === 'true') return;
  void enqueueRecurringJobs();
  timer = setInterval(() => {
    void processJobQueue().catch((error) => {
      logger.error('Job worker tick failed', {
        error: error instanceof Error ? error.message : 'unknown',
      });
    });
  }, 15_000);
  timer.unref?.();
}

export async function enqueueRecurringJobs() {
  await enqueueJob('auction.close', {});
  await enqueueJob('reservation.expire', {});
  await enqueueJob('payment.reconcile', {});
  await enqueueJob('email.deliver', {});
  await enqueueJob('monitoring.scan', {});
}

export function stopBackgroundWorkers() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
