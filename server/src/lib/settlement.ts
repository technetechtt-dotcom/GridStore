import { createId } from './ids.js';
import { hasDatabase, requireSql } from '../db/client.js';
import { postJournal, accountBalanceCents } from './ledger.js';
import { recordSecurityEvent } from './security.js';
import { platformStore } from '../store/index.js';
import { computeFeeSplit, platformFeeRate } from './settlementFees.js';

export type PayoutStatus = 'scheduled' | 'processing' | 'paid' | 'failed' | 'cancelled';

export interface SellerPayout {
  id: string;
  sellerId: string;
  amountCents: number;
  platformFeeCents: number;
  status: PayoutStatus;
  scheduleAt: string;
  paidAt?: string;
  createdAt: string;
  memo: string;
  transferReference?: string;
}

const memoryPayouts: SellerPayout[] = [];

export { computeFeeSplit, platformFeeRate } from './settlementFees.js';

function rowToPayout(row: Record<string, unknown>): SellerPayout {
  return {
    id: String(row.id),
    sellerId: String(row.seller_id),
    amountCents: Number(row.amount_cents),
    platformFeeCents: Number(row.platform_fee_cents ?? 0),
    status: String(row.status) as PayoutStatus,
    scheduleAt: String(row.schedule_at),
    paidAt: row.paid_at ? String(row.paid_at) : undefined,
    createdAt: String(row.created_at),
    memo: String(row.memo ?? ''),
    transferReference: row.transfer_reference ? String(row.transfer_reference) : undefined,
  };
}

async function persistPayout(payout: SellerPayout) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_payouts (
      id, seller_id, amount_cents, platform_fee_cents, status, schedule_at, paid_at, created_at, memo, transfer_reference
    ) VALUES (
      ${payout.id}, ${payout.sellerId}, ${payout.amountCents}, ${payout.platformFeeCents},
      ${payout.status}, ${payout.scheduleAt}, ${payout.paidAt ?? null}, ${payout.createdAt}, ${payout.memo},
      ${payout.transferReference ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      paid_at = EXCLUDED.paid_at,
      transfer_reference = EXCLUDED.transfer_reference
  `;
}

export async function scheduleSellerPayout(input: {
  sellerId: string;
  amountCents: number;
  memo?: string;
  scheduleAt?: string;
}) {
  if (input.amountCents <= 0) throw new Error('Payout amount must be positive');
  const payable = accountBalanceCents('seller_payable');
  if (input.amountCents > payable) {
    throw new Error('Insufficient seller payable balance for payout');
  }
  const rate = platformFeeRate();
  const { platformFeeCents } = computeFeeSplit(
    rate < 1 ? Math.round(input.amountCents / (1 - rate)) : input.amountCents
  );
  const now = new Date().toISOString();
  const payout: SellerPayout = {
    id: createId('payout'),
    sellerId: input.sellerId,
    amountCents: input.amountCents,
    platformFeeCents,
    status: 'scheduled',
    scheduleAt: input.scheduleAt ?? now,
    createdAt: now,
    memo: input.memo ?? 'Seller settlement',
  };
  memoryPayouts.unshift(payout);
  await persistPayout(payout);
  recordSecurityEvent('payout.scheduled', {
    actorId: input.sellerId,
    targetId: payout.id,
    detail: { amountCents: payout.amountCents },
  });
  return payout;
}

export async function markPayoutPaid(payoutId: string, actorId = 'system', transferReference?: string) {
  let payout = memoryPayouts.find((item) => item.id === payoutId);
  if (!payout && hasDatabase()) {
    const rows = (await requireSql()`
      SELECT * FROM gridstore_payouts WHERE id = ${payoutId} LIMIT 1
    `) as Record<string, unknown>[];
    if (rows[0]) payout = rowToPayout(rows[0]);
  }
  if (!payout) throw new Error('Payout not found');
  if (payout.status === 'paid') return payout;

  payout.status = 'paid';
  payout.paidAt = new Date().toISOString();
  if (transferReference) payout.transferReference = transferReference;
  const existingIdx = memoryPayouts.findIndex((item) => item.id === payoutId);
  if (existingIdx >= 0) memoryPayouts[existingIdx] = payout;
  else memoryPayouts.unshift(payout);
  await persistPayout(payout);
  await postJournal({
    type: 'seller_payout',
    createdBy: actorId,
    lines: [
      {
        account: 'seller_payable',
        direction: 'debit',
        amountCents: payout.amountCents,
        memo: `Payout ${payout.id}`,
      },
      {
        account: 'cash_provider',
        direction: 'credit',
        amountCents: payout.amountCents,
        memo: `Payout disbursement ${payout.id}`,
      },
    ],
  });
  recordSecurityEvent('payout.paid', { actorId, targetId: payout.id });
  return payout;
}

export async function processDuePayouts(actorId = 'system') {
  const now = new Date().toISOString();
  let due = memoryPayouts.filter(
    (item) => item.status === 'scheduled' && item.scheduleAt <= now
  );
  if (hasDatabase()) {
    const rows = (await requireSql()`
      SELECT * FROM gridstore_payouts
      WHERE status = 'scheduled' AND schedule_at <= ${now}
      ORDER BY schedule_at ASC
      LIMIT 50
    `) as Record<string, unknown>[];
    due = rows.map(rowToPayout);
  }

  const results: SellerPayout[] = [];
  for (const payout of due) {
    payout.status = 'processing';
    await persistPayout(payout);

    const recipientCode = process.env[`PAYSTACK_RECIPIENT_${payout.sellerId}`];
    if (recipientCode && process.env.PAYSTACK_SECRET_KEY) {
      try {
        const { initiatePaystackTransfer } = await import('./paystack.js');
        const transfer = await initiatePaystackTransfer({
          amountCents: payout.amountCents,
          recipientCode,
          reference: `payout_${payout.id}`,
          reason: payout.memo,
        });
        results.push(await markPayoutPaid(payout.id, actorId, transfer.reference));
        continue;
      } catch (error) {
        payout.status = 'failed';
        await persistPayout(payout);
        recordSecurityEvent('payout.transfer_failed', {
          actorId,
          targetId: payout.id,
          detail: { error: error instanceof Error ? error.message : 'unknown' },
        });
        continue;
      }
    }

    // Sandbox / no recipient: mark paid locally after hold period.
    results.push(await markPayoutPaid(payout.id, actorId));
  }
  return results;
}

/** Schedule payouts for delivered orders past the settlement hold window. */
export async function scheduleEligibleSellerPayouts(holdDays = 7) {
  const holdMs = holdDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - holdMs;
  const feeRate = platformFeeRate();
  const bySeller = new Map<string, number>();

  for (const order of platformStore.listAllOrders()) {
    if (order.status !== 'delivered') continue;
    const created = new Date(order.createdAt).getTime();
    if (!Number.isFinite(created) || created > cutoff) continue;

    for (const line of order.lines) {
      if (!line.sellerId) continue;
      const lineCents = (line.unitPriceCents ?? Math.round(line.unitPrice * 100)) * line.quantity;
      const sellerCents = Math.round(lineCents * (1 - feeRate));
      bySeller.set(line.sellerId, (bySeller.get(line.sellerId) ?? 0) + sellerCents);
    }
  }

  const existing = await listPayouts();
  const scheduled: SellerPayout[] = [];
  for (const [sellerId, amountCents] of bySeller) {
    if (amountCents <= 0) continue;
    const already = existing.some(
      (item) =>
        item.sellerId === sellerId &&
        item.memo.includes('auto-settlement') &&
        ['scheduled', 'processing', 'paid'].includes(item.status)
    );
    if (already) continue;
    const payable = accountBalanceCents('seller_payable');
    const amount = Math.min(amountCents, payable);
    if (amount <= 0) continue;
    scheduled.push(
      await scheduleSellerPayout({
        sellerId,
        amountCents: amount,
        memo: `auto-settlement hold=${holdDays}d`,
      })
    );
  }
  return scheduled;
}

export async function listPayouts(sellerId?: string) {
  if (hasDatabase()) {
    const db = requireSql();
    const rows = (sellerId
      ? await db`SELECT * FROM gridstore_payouts WHERE seller_id = ${sellerId} ORDER BY created_at DESC`
      : await db`SELECT * FROM gridstore_payouts ORDER BY created_at DESC`) as Record<string, unknown>[];
    return rows.map(rowToPayout);
  }
  return memoryPayouts.filter((item) => (sellerId ? item.sellerId === sellerId : true));
}

export async function sellerPayoutSummary(sellerId: string) {
  const payouts = await listPayouts(sellerId);
  const paid = payouts
    .filter((item) => item.status === 'paid')
    .reduce((sum, item) => sum + item.amountCents, 0);
  const pending = payouts
    .filter((item) => ['scheduled', 'processing'].includes(item.status))
    .reduce((sum, item) => sum + item.amountCents, 0);
  const next = payouts
    .filter((item) => item.status === 'scheduled')
    .sort((a, b) => a.scheduleAt.localeCompare(b.scheduleAt))[0];

  // Approximate available from delivered order lines not yet paid out.
  const feeRate = platformFeeRate();
  let earnedCents = 0;
  for (const order of platformStore.listAllOrders()) {
    if (!['delivered', 'paid', 'processing', 'shipped'].includes(order.status)) continue;
    for (const line of order.lines) {
      if (line.sellerId !== sellerId) continue;
      const lineCents = (line.unitPriceCents ?? Math.round(line.unitPrice * 100)) * line.quantity;
      earnedCents += Math.round(lineCents * (1 - feeRate));
    }
  }
  const availableCents = Math.max(0, earnedCents - paid - pending);

  return {
    sellerId,
    availableCents,
    pendingCents: pending,
    paidCents: paid,
    nextPayoutDate: next?.scheduleAt ?? null,
    payouts,
  };
}

export function resetPayoutsForTests() {
  memoryPayouts.length = 0;
}
