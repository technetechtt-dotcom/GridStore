import { neon } from '@neondatabase/serverless';
import { env } from '../config/env.js';

export const sql = env.databaseUrl ? neon(env.databaseUrl) : null;

export function hasDatabase() {
  return Boolean(sql);
}

export function requireSql() {
  if (!sql) {
    throw new Error('DATABASE_URL is not configured');
  }
  return sql;
}

/** Run a batch of queries in one Neon HTTP transaction when available. */
export async function runTransaction<T>(
  build: (txn: NonNullable<typeof sql>) => Array<Promise<T> | T>
): Promise<T[]> {
  const db = requireSql();
  if (typeof (db as { transaction?: unknown }).transaction === 'function') {
    return (db as { transaction: (fn: (txn: typeof db) => unknown[]) => Promise<T[]> }).transaction(
      (txn) => build(txn) as unknown[]
    );
  }
  // Fallback: sequential (should not happen on supported Neon versions).
  const results: T[] = [];
  for (const item of build(db)) {
    results.push(await item);
  }
  return results;
}
