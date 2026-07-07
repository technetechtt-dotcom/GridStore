import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
config({ path: path.join(serverRoot, '.env') });

export const env = {
  port: Number(process.env.PORT ?? '4000'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET ?? 'gridstore-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  databaseUrl:
    process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
      ? ''
      : (process.env.DATABASE_URL ?? ''),
};
