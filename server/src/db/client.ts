import { neon } from '@neondatabase/serverless';
import { env } from '../config/env.js';

export const sql = env.databaseUrl ? neon(env.databaseUrl) : null;

export function requireSql() {
  if (!sql) {
    throw new Error('DATABASE_URL is not configured');
  }
  return sql;
}
