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

export function resetLedgerForTests() {
  journals.length = 0;
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

export function postJournal(input: {
  type: string;
  createdBy: string;
  orderId?: string;
  paymentId?: string;
  lines: Array<{ account: LedgerAccount; direction: 'debit' | 'credit'; amountCents: number; memo: string }>;
}): LedgerJournal {
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
  return journal;
}

/** Platform fee: 12% of GMV (matches existing payout helper). */
export function postPaymentCaptureJournal(input: {
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

export function postRefundJournal(input: {
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

export function validateLedgerIntegrity() {
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
