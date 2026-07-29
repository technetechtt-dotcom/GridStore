import { createId } from './ids.js';
import { hasDatabase, requireSql } from '../db/client.js';
import { postJournal, accountBalanceCents } from './ledger.js';
import { recordSecurityEvent } from './security.js';

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
}

const memoryPayouts: SellerPayout[] = [];

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
  };
}

async function persistPayout(payout: SellerPayout) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_payouts (
      id, seller_id, amount_cents, platform_fee_cents, status, schedule_at, paid_at, created_at, memo
    ) VALUES (
      ${payout.id}, ${payout.sellerId}, ${payout.amountCents}, ${payout.platformFeeCents},
      ${payout.status}, ${payout.scheduleAt}, ${payout.paidAt ?? null}, ${payout.createdAt}, ${payout.memo}
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      paid_at = EXCLUDED.paid_at
  `;
}

export function platformFeeRate() {
  return Number(process.env.PLATFORM_FEE_RATE ?? '0.12');
}

export function computeFeeSplit(amountCents: number) {
  const platformFeeCents = Math.round(amountCents * platformFeeRate());
  return { platformFeeCents, sellerCents: amountCents - platformFeeCents };
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
  const { platformFeeCents } = computeFeeSplit(Math.round(input.amountCents / (1 - platformFeeRate())));
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

export async function markPayoutPaid(payoutId: string, actorId = 'system') {
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

export function resetPayoutsForTests() {
  memoryPayouts.length = 0;
}
