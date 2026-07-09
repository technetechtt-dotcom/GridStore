import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: path.join(serverRoot, '.env') });

function parseCorsOrigins() {
  const origins = new Set<string>(['http://localhost:5173', 'http://localhost:5174']);
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

  return Array.from(origins);
}

export const env = {
  port: Number(process.env.PORT ?? '4000'),
  corsOrigins: parseCorsOrigins(),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? 'gridstore-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  databaseUrl:
    process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? ''
      : (process.env.DATABASE_URL ?? ''),
};
