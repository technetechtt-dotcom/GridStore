import { hasDatabase, requireSql } from '../db/client.js';
import { recordSecurityEvent } from './security.js';
import { paystackConfigured, createPaystackTransferRecipient } from './paystack.js';

export interface SellerPayoutProfile {
  sellerId: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  bankName?: string;
  recipientCode?: string;
  verified: boolean;
  updatedAt: string;
  createdAt: string;
}

const memoryProfiles = new Map<string, SellerPayoutProfile>();

function rowToProfile(row: Record<string, unknown>): SellerPayoutProfile {
  return {
    sellerId: String(row.seller_id),
    accountName: String(row.account_name),
    accountNumber: String(row.account_number),
    bankCode: String(row.bank_code),
    bankName: row.bank_name ? String(row.bank_name) : undefined,
    recipientCode: row.recipient_code ? String(row.recipient_code) : undefined,
    verified: Boolean(row.verified),
    updatedAt: String(row.updated_at),
    createdAt: String(row.created_at),
  };
}

async function persistProfile(profile: SellerPayoutProfile) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_seller_payout_profiles (
      seller_id, account_name, account_number, bank_code, bank_name, recipient_code, verified, created_at, updated_at
    ) VALUES (
      ${profile.sellerId}, ${profile.accountName}, ${profile.accountNumber}, ${profile.bankCode},
      ${profile.bankName ?? null}, ${profile.recipientCode ?? null}, ${profile.verified},
      ${profile.createdAt}, ${profile.updatedAt}
    )
    ON CONFLICT (seller_id) DO UPDATE SET
      account_name = EXCLUDED.account_name,
      account_number = EXCLUDED.account_number,
      bank_code = EXCLUDED.bank_code,
      bank_name = EXCLUDED.bank_name,
      recipient_code = EXCLUDED.recipient_code,
      verified = EXCLUDED.verified,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function getSellerPayoutProfile(sellerId: string) {
  const cached = memoryProfiles.get(sellerId);
  if (cached) return cached;
  if (!hasDatabase()) return undefined;
  const rows = (await requireSql()`
    SELECT * FROM gridstore_seller_payout_profiles WHERE seller_id = ${sellerId} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  const profile = rowToProfile(rows[0]);
  memoryProfiles.set(sellerId, profile);
  return profile;
}

export async function upsertSellerPayoutProfile(input: {
  sellerId: string;
  accountName: string;
  accountNumber: string;
  bankCode: string;
  bankName?: string;
}) {
  const accountNumber = input.accountNumber.replace(/\s+/g, '');
  if (!/^\d{6,16}$/.test(accountNumber)) {
    throw new Error('Account number must be 6–16 digits');
  }
  if (!input.bankCode.trim()) throw new Error('Bank code is required');
  if (!input.accountName.trim()) throw new Error('Account name is required');

  const now = new Date().toISOString();
  const existing = await getSellerPayoutProfile(input.sellerId);
  const profile: SellerPayoutProfile = {
    sellerId: input.sellerId,
    accountName: input.accountName.trim(),
    accountNumber,
    bankCode: input.bankCode.trim(),
    bankName: input.bankName?.trim(),
    recipientCode: existing?.recipientCode,
    verified: false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  if (paystackConfigured()) {
    const recipient = await createPaystackTransferRecipient({
      name: profile.accountName,
      accountNumber: profile.accountNumber,
      bankCode: profile.bankCode,
    });
    profile.recipientCode = recipient.recipient_code;
    profile.verified = true;
  } else {
    // Dev/sandbox: synthesize a local recipient code so payouts can proceed.
    profile.recipientCode = `RCP_LOCAL_${profile.sellerId.slice(-8)}`;
    profile.verified = true;
  }

  memoryProfiles.set(profile.sellerId, profile);
  await persistProfile(profile);
  recordSecurityEvent('payout.profile.updated', {
    actorId: input.sellerId,
    targetId: input.sellerId,
    detail: { bankCode: profile.bankCode, verified: profile.verified },
  });
  return {
    ...profile,
    accountNumber: `****${profile.accountNumber.slice(-4)}`,
  };
}

export async function resolveTransferRecipientCode(sellerId: string) {
  const fromEnv = process.env[`PAYSTACK_RECIPIENT_${sellerId}`];
  if (fromEnv) return fromEnv;
  const profile = await getSellerPayoutProfile(sellerId);
  return profile?.recipientCode;
}

export function publicPayoutProfile(profile: SellerPayoutProfile) {
  return {
    ...profile,
    accountNumber: `****${profile.accountNumber.slice(-4)}`,
  };
}

export function resetPayoutProfilesForTests() {
  memoryProfiles.clear();
}

/** Common South African bank codes used by Paystack. */
export const SA_BANK_OPTIONS = [
  { code: '632005', name: 'Absa' },
  { code: '250655', name: 'Capitec' },
  { code: '470010', name: 'Discovery Bank' },
  { code: '198765', name: 'FNB' },
  { code: '051001', name: 'Standard Bank' },
  { code: '678910', name: 'TymeBank' },
  { code: '584000', name: 'Investec' },
  { code: '462005', name: 'Bidvest Bank' },
] as const;
