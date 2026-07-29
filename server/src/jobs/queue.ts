import { hasDatabase, requireSql } from '../db/client.js';
import { createId } from '../lib/ids.js';

export type JobType =
  | 'auction.close'
  | 'payment.reconcile'
  | 'reservation.expire'
  | 'email.deliver'
  | 'monitoring.scan';

export interface BackgroundJob {
  id: string;
  type: JobType;
  payload: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  availableAt: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

const memoryJobs: BackgroundJob[] = [];

function rowToJob(row: Record<string, unknown>): BackgroundJob {
  return {
    id: String(row.id),
    type: String(row.type) as JobType,
    payload: (typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload) as Record<
      string,
      unknown
    >,
    status: String(row.status) as BackgroundJob['status'],
    attempts: Number(row.attempts ?? 0),
    availableAt: String(row.available_at),
    lastError: row.last_error ? String(row.last_error) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function enqueueJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  delayMs = 0
): Promise<BackgroundJob> {
  const now = new Date();
  const job: BackgroundJob = {
    id: createId('job'),
    type,
    payload,
    status: 'pending',
    attempts: 0,
    availableAt: new Date(now.getTime() + delayMs).toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  if (hasDatabase()) {
    const db = requireSql();
    await db`
      INSERT INTO gridstore_jobs (id, type, payload, status, attempts, available_at, created_at, updated_at)
      VALUES (
        ${job.id}, ${job.type}, ${JSON.stringify(job.payload)}, ${job.status}, ${job.attempts},
        ${job.availableAt}, ${job.createdAt}, ${job.updatedAt}
      )
    `;
  } else {
    memoryJobs.push(job);
  }
  return job;
}

export async function claimPendingJobs(limit = 10): Promise<BackgroundJob[]> {
  const now = new Date().toISOString();
  if (hasDatabase()) {
    const db = requireSql();
    const rows = (await db`
      UPDATE gridstore_jobs
      SET status = 'running', updated_at = ${now}, attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM gridstore_jobs
        WHERE status = 'pending' AND available_at <= ${now}
        ORDER BY available_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }

  const claimed: BackgroundJob[] = [];
  for (const job of memoryJobs) {
    if (claimed.length >= limit) break;
    if (job.status === 'pending' && job.availableAt <= now) {
      job.status = 'running';
      job.attempts += 1;
      job.updatedAt = now;
      claimed.push(job);
    }
  }
  return claimed;
}

export async function completeJob(id: string) {
  const now = new Date().toISOString();
  if (hasDatabase()) {
    const db = requireSql();
    await db`
      UPDATE gridstore_jobs
      SET status = 'completed', updated_at = ${now}, last_error = NULL
      WHERE id = ${id}
    `;
    return;
  }
  const job = memoryJobs.find((item) => item.id === id);
  if (job) {
    job.status = 'completed';
    job.updatedAt = now;
    job.lastError = undefined;
  }
}

export async function failJob(id: string, error: string, retryDelayMs = 30_000) {
  const now = new Date();
  const availableAt = new Date(now.getTime() + retryDelayMs).toISOString();
  if (hasDatabase()) {
    const db = requireSql();
    await db`
      UPDATE gridstore_jobs
      SET
        status = CASE WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END,
        last_error = ${error.slice(0, 1000)},
        available_at = ${availableAt},
        updated_at = ${now.toISOString()}
      WHERE id = ${id}
    `;
    return;
  }
  const job = memoryJobs.find((item) => item.id === id);
  if (job) {
    job.lastError = error.slice(0, 1000);
    job.updatedAt = now.toISOString();
    job.status = job.attempts >= 8 ? 'failed' : 'pending';
    job.availableAt = availableAt;
  }
}

export function resetJobsForTests() {
  memoryJobs.length = 0;
}

export async function listJobs(limit = 50) {
  if (hasDatabase()) {
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_jobs ORDER BY created_at DESC LIMIT ${limit}
    `) as Record<string, unknown>[];
    return rows.map(rowToJob);
  }
  return [...memoryJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit);
}
