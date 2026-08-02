import { hasDatabase, requireSql } from '../db/client.js';

export interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
}

export interface PlatformSettings {
  features: FeatureFlag[];
  regions: string[];
  environment: string;
  updatedAt?: string;
}

const DEFAULT_FEATURES: FeatureFlag[] = [
  { key: 'ai_assistant', label: 'Enable AI Shopping Assistant', enabled: true },
  { key: 'escrow_payments', label: 'Enable Escrow Payments', enabled: false },
  { key: 'seller_subscriptions', label: 'Enable Seller Subscriptions', enabled: false },
  { key: 'instant_eft', label: 'Enable Instant EFT', enabled: true },
  { key: 'dark_mode_default', label: 'Enable Dark Mode Default', enabled: true },
  { key: 'require_email_verification', label: 'Require email verification for checkout/listings', enabled: true },
];

const DEFAULT_REGIONS = ['Western Cape', 'Gauteng', 'KwaZulu-Natal', 'National'];

let memorySettings: PlatformSettings = {
  features: DEFAULT_FEATURES.map((item) => ({ ...item })),
  regions: [...DEFAULT_REGIONS],
  environment: process.env.NODE_ENV ?? 'development',
};

function mergeFeatures(stored: Record<string, boolean> | undefined): FeatureFlag[] {
  return DEFAULT_FEATURES.map((flag) => ({
    ...flag,
    enabled: stored && flag.key in stored ? Boolean(stored[flag.key]) : flag.enabled,
  }));
}

export async function getPlatformSettings(): Promise<PlatformSettings> {
  if (!hasDatabase()) {
    return {
      ...memorySettings,
      features: memorySettings.features.map((item) => ({ ...item })),
      regions: [...memorySettings.regions],
    };
  }

  const db = requireSql();
  const rows = (await db`
    SELECT payload, updated_at FROM gridstore_settings WHERE id = 'platform' LIMIT 1
  `) as Array<{ payload: Record<string, unknown>; updated_at: string }>;

  if (!rows[0]) {
    await db`
      INSERT INTO gridstore_settings (id, payload, updated_at)
      VALUES (
        'platform',
        ${JSON.stringify({
          features: Object.fromEntries(DEFAULT_FEATURES.map((item) => [item.key, item.enabled])),
          regions: DEFAULT_REGIONS,
        })}::jsonb,
        ${new Date().toISOString()}
      )
      ON CONFLICT (id) DO NOTHING
    `;
    return {
      features: DEFAULT_FEATURES.map((item) => ({ ...item })),
      regions: [...DEFAULT_REGIONS],
      environment: process.env.NODE_ENV ?? 'development',
    };
  }

  const payload = rows[0].payload ?? {};
  const featureMap = (payload.features ?? {}) as Record<string, boolean>;
  const regions = Array.isArray(payload.regions)
    ? (payload.regions as string[])
    : [...DEFAULT_REGIONS];

  return {
    features: mergeFeatures(featureMap),
    regions,
    environment: process.env.NODE_ENV ?? 'development',
    updatedAt: rows[0].updated_at,
  };
}

export async function updatePlatformSettings(input: {
  features?: Array<{ key: string; enabled: boolean }>;
}): Promise<PlatformSettings> {
  const current = await getPlatformSettings();
  const nextMap = Object.fromEntries(current.features.map((item) => [item.key, item.enabled]));
  for (const patch of input.features ?? []) {
    if (patch.key in nextMap) nextMap[patch.key] = patch.enabled;
  }

  const next: PlatformSettings = {
    features: mergeFeatures(nextMap),
    regions: current.regions,
    environment: current.environment,
    updatedAt: new Date().toISOString(),
  };

  memorySettings = {
    features: next.features.map((item) => ({ ...item })),
    regions: [...next.regions],
    environment: next.environment,
    updatedAt: next.updatedAt,
  };

  if (hasDatabase()) {
    const db = requireSql();
    await db`
      INSERT INTO gridstore_settings (id, payload, updated_at)
      VALUES (
        'platform',
        ${JSON.stringify({
          features: nextMap,
          regions: next.regions,
        })}::jsonb,
        ${next.updatedAt}
      )
      ON CONFLICT (id) DO UPDATE SET
        payload = EXCLUDED.payload,
        updated_at = EXCLUDED.updated_at
    `;
  }

  return next;
}

export async function isFeatureEnabled(key: string, fallback = false) {
  const settings = await getPlatformSettings();
  return settings.features.find((item) => item.key === key)?.enabled ?? fallback;
}

export function resetPlatformSettingsForTests() {
  memorySettings = {
    features: DEFAULT_FEATURES.map((item) => ({ ...item })),
    regions: [...DEFAULT_REGIONS],
    environment: process.env.NODE_ENV ?? 'development',
  };
}
