import { hasDatabase, requireSql } from '../db/client.js';
import { createId } from './ids.js';

export type LedgerAccount =
  | 'cash_provider'
  | 'customer_clearing'
  | 'seller_payable'
  | 'platform_fees'
  | 'refunds'
  | 'orders_revenue';

export interface LedgerEntry {
  id: string;
  journalId: string;
  account: LedgerAccount;
  direction: 'debit' | 'credit';
  amountCents: number;
  currency: 'ZAR';
  orderId?: string;
  paymentId?: string;
  memo: string;
  createdAt: string;
  createdBy: string;
}

export interface LedgerJournal {
  id: string;
  type: string;
  orderId?: string;
  paymentId?: string;
  createdAt: string;
  createdBy: string;
  entries: LedgerEntry[];
}

const journals: LedgerJournal[] = [];
let ledgerHydrated = false;

export function resetLedgerForTests() {
  journals.length = 0;
  ledgerHydrated = false;
}

export async function loadLedgerFromDatabase() {
  if (!hasDatabase() || ledgerHydrated) return;
  const db = requireSql();
  const journalRows = (await db`
    SELECT * FROM gridstore_ledger_journals ORDER BY created_at ASC
  `) as Record<string, unknown>[];
  const entryRows = (await db`
    SELECT * FROM gridstore_ledger_entries ORDER BY created_at ASC
  `) as Record<string, unknown>[];

  const entriesByJournal = new Map<string, LedgerEntry[]>();
  for (const row of entryRows) {
    const entry: LedgerEntry = {
      id: String(row.id),
      journalId: String(row.journal_id),
      account: String(row.account) as LedgerAccount,
      direction: String(row.direction) as 'debit' | 'credit',
      amountCents: Number(row.amount_cents),
      currency: 'ZAR',
      orderId: row.order_id ? String(row.order_id) : undefined,
      paymentId: row.payment_id ? String(row.payment_id) : undefined,
      memo: String(row.memo),
      createdAt: String(row.created_at),
      createdBy: String(row.created_by),
    };
    const list = entriesByJournal.get(entry.journalId) ?? [];
    list.push(entry);
    entriesByJournal.set(entry.journalId, list);
  }

  journals.length = 0;
  for (const row of journalRows) {
    const id = String(row.id);
    journals.push({
      id,
      type: String(row.type),
      orderId: row.order_id ? String(row.order_id) : undefined,
      paymentId: row.payment_id ? String(row.payment_id) : undefined,
      createdAt: String(row.created_at),
      createdBy: String(row.created_by),
      entries: entriesByJournal.get(id) ?? [],
    });
  }
  ledgerHydrated = true;
}

export function listLedgerJournals() {
  return [...journals];
}

export function listLedgerEntries() {
  return journals.flatMap((journal) => journal.entries);
}

export function accountBalanceCents(account: LedgerAccount) {
  const creditNormal: LedgerAccount[] = ['seller_payable', 'platform_fees', 'orders_revenue'];
  const creditIsPositive = creditNormal.includes(account);
  return listLedgerEntries()
    .filter((entry) => entry.account === account)
    .reduce((sum, entry) => {
      const signed =
        entry.direction === 'debit'
          ? creditIsPositive
            ? -entry.amountCents
            : entry.amountCents
          : creditIsPositive
            ? entry.amountCents
            : -entry.amountCents;
      return sum + signed;
    }, 0);
}

function assertBalanced(entries: Array<{ direction: 'debit' | 'credit'; amountCents: number }>) {
  const debit = entries.filter((e) => e.direction === 'debit').reduce((s, e) => s + e.amountCents, 0);
  const credit = entries.filter((e) => e.direction === 'credit').reduce((s, e) => s + e.amountCents, 0);
  if (debit !== credit) {
    throw new Error(`Unbalanced ledger journal: debit ${debit} != credit ${credit}`);
  }
}

async function persistJournal(journal: LedgerJournal) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_ledger_journals (id, type, order_id, payment_id, created_by, created_at)
    VALUES (
      ${journal.id}, ${journal.type}, ${journal.orderId ?? null}, ${journal.paymentId ?? null},
      ${journal.createdBy}, ${journal.createdAt}
    )
  `;
  for (const entry of journal.entries) {
    await db`
      INSERT INTO gridstore_ledger_entries (
        id, journal_id, account, direction, amount_cents, currency, order_id, payment_id, memo, created_by, created_at
      ) VALUES (
        ${entry.id}, ${entry.journalId}, ${entry.account}, ${entry.direction}, ${entry.amountCents},
        ${entry.currency}, ${entry.orderId ?? null}, ${entry.paymentId ?? null}, ${entry.memo},
        ${entry.createdBy}, ${entry.createdAt}
      )
    `;
  }
}

export async function postJournal(input: {
  type: string;
  createdBy: string;
  orderId?: string;
  paymentId?: string;
  lines: Array<{ account: LedgerAccount; direction: 'debit' | 'credit'; amountCents: number; memo: string }>;
}): Promise<LedgerJournal> {
  if (!input.lines.length) throw new Error('Ledger journal requires lines');
  for (const line of input.lines) {
    if (!Number.isInteger(line.amountCents) || line.amountCents <= 0) {
      throw new Error('Ledger amounts must be positive integer cents');
    }
  }
  assertBalanced(input.lines);

  const journalId = createId('jnl');
  const createdAt = new Date().toISOString();
  const entries: LedgerEntry[] = input.lines.map((line) => ({
    id: createId('led'),
    journalId,
    account: line.account,
    direction: line.direction,
    amountCents: line.amountCents,
    currency: 'ZAR',
    orderId: input.orderId,
    paymentId: input.paymentId,
    memo: line.memo,
    createdAt,
    createdBy: input.createdBy,
  }));

  const journal: LedgerJournal = {
    id: journalId,
    type: input.type,
    orderId: input.orderId,
    paymentId: input.paymentId,
    createdAt,
    createdBy: input.createdBy,
    entries,
  };
  journals.push(journal);
  await persistJournal(journal);
  return journal;
}

/** Platform fee: 12% of GMV (matches existing payout helper). */
export async function postPaymentCaptureJournal(input: {
  orderId: string;
  paymentId: string;
  amountCents: number;
  createdBy?: string;
}) {
  const feeCents = Math.round(input.amountCents * 0.12);
  const sellerCents = input.amountCents - feeCents;
  return postJournal({
    type: 'payment_capture',
    createdBy: input.createdBy ?? 'system',
    orderId: input.orderId,
    paymentId: input.paymentId,
    lines: [
      { account: 'cash_provider', direction: 'debit', amountCents: input.amountCents, memo: 'Provider capture' },
      { account: 'seller_payable', direction: 'credit', amountCents: sellerCents, memo: 'Seller net' },
      { account: 'platform_fees', direction: 'credit', amountCents: feeCents, memo: 'Platform fee' },
    ],
  });
}

export async function postRefundJournal(input: {
  orderId: string;
  paymentId: string;
  amountCents: number;
  createdBy?: string;
}) {
  const feeCents = Math.round(input.amountCents * 0.12);
  const sellerCents = input.amountCents - feeCents;
  return postJournal({
    type: 'payment_refund',
    createdBy: input.createdBy ?? 'system',
    orderId: input.orderId,
    paymentId: input.paymentId,
    lines: [
      { account: 'seller_payable', direction: 'debit', amountCents: sellerCents, memo: 'Reverse seller net' },
      { account: 'platform_fees', direction: 'debit', amountCents: feeCents, memo: 'Reverse platform fee' },
      { account: 'cash_provider', direction: 'credit', amountCents: input.amountCents, memo: 'Provider refund' },
    ],
  });
}

export async function validateLedgerIntegrity() {
  const byJournal = new Map<string, number>();
  for (const entry of listLedgerEntries()) {
    const delta = entry.direction === 'debit' ? entry.amountCents : -entry.amountCents;
    byJournal.set(entry.journalId, (byJournal.get(entry.journalId) ?? 0) + delta);
  }
  for (const [journalId, net] of byJournal) {
    if (net !== 0) {
      throw new Error(`Ledger journal ${journalId} is unbalanced`);
    }
  }
  return true;
}
