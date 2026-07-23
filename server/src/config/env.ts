import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: path.join(serverRoot, '.env') });

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isTest = process.env.VITEST === 'true' || nodeEnv === 'test';
const isProduction = nodeEnv === 'production';

function parseCorsOrigins() {
  const origins = new Set<string>();
  if (!isProduction) {
    origins.add('http://localhost:5173');
    origins.add('http://localhost:5174');
  }

  const add = (value?: string) => {
    if (!value) return;
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => origins.add(item));
  };

  add(process.env.CORS_ORIGIN);
  add(process.env.CORS_EXTRA_ORIGIN);
  add(process.env.PUBLIC_WEB_URL);
  add(process.env.PUBLIC_ADMIN_URL);

  return Array.from(origins);
}

const renderDefaults =
  process.env.RENDER === 'true'
    ? {
        web: 'https://gridstore-web.onrender.com',
        admin: 'https://gridstore-admin.onrender.com',
      }
    : null;

const explicitDemoFlag = process.env.ENABLE_DEMO_DATA;
const enableDemoData =
  explicitDemoFlag === 'true' ||
  (explicitDemoFlag !== 'false' && (isTest || (!isProduction && explicitDemoFlag == null)));

const DEFAULT_DEV_JWT = 'gridstore-dev-secret';

export const env = {
  nodeEnv,
  isProduction,
  isTest,
  port: Number(process.env.PORT ?? '4000'),
  corsOrigins: parseCorsOrigins(),
  corsOrigin: process.env.CORS_ORIGIN ?? (isProduction ? '' : 'http://localhost:5173'),
  jwtSecret: process.env.JWT_SECRET ?? DEFAULT_DEV_JWT,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
  databaseUrl: isTest ? '' : (process.env.DATABASE_URL ?? ''),
  publicWebUrl: process.env.PUBLIC_WEB_URL ?? renderDefaults?.web ?? 'http://localhost:5173',
  publicAdminUrl: process.env.PUBLIC_ADMIN_URL ?? renderDefaults?.admin ?? 'http://localhost:5174',
  enableDemoData,
  jsonBodyLimit: process.env.JSON_BODY_LIMIT ?? '100kb',
  allowSimulatedOauth: !isProduction && process.env.ALLOW_SIMULATED_OAUTH !== 'false',
};

export function assertSecurityConfig() {
  if (!isProduction) return;

  if (env.enableDemoData) {
    throw new Error(
      'Refusing to start: ENABLE_DEMO_DATA is enabled in production. Set ENABLE_DEMO_DATA=false.'
    );
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEFAULT_DEV_JWT) {
    throw new Error(
      'Refusing to start: JWT_SECRET must be set to a strong unique value in production.'
    );
  }

  if (env.corsOrigins.length === 0) {
    throw new Error(
      'Refusing to start: CORS_ORIGIN (or PUBLIC_WEB_URL / PUBLIC_ADMIN_URL) must list exact approved domains.'
    );
  }

  if (env.corsOrigin === '*') {
    throw new Error('Refusing to start: wildcard CORS_ORIGIN=* is not allowed in production.');
  }
}
