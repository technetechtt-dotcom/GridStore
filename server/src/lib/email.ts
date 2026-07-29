import { hasDatabase, requireSql } from '../db/client.js';
import { createId } from './ids.js';
import { logger } from './security.js';

export interface EmailOutboxEntry {
  id: string;
  to: string;
  subject: string;
  body: string;
  status: 'queued' | 'sent' | 'failed';
  provider?: string;
  providerMessageId?: string;
  error?: string;
  createdAt: string;
  sentAt?: string;
}

const memoryOutbox: EmailOutboxEntry[] = [];

function rowToEntry(row: Record<string, unknown>): EmailOutboxEntry {
  return {
    id: String(row.id),
    to: String(row.to_address ?? row.to),
    subject: String(row.subject),
    body: String(row.body),
    status: String(row.status) as EmailOutboxEntry['status'],
    provider: row.provider ? String(row.provider) : undefined,
    providerMessageId: row.provider_message_id ? String(row.provider_message_id) : undefined,
    error: row.error ? String(row.error) : undefined,
    createdAt: String(row.created_at),
    sentAt: row.sent_at ? String(row.sent_at) : undefined,
  };
}

async function persistEntry(entry: EmailOutboxEntry) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_email_outbox (
      id, to_address, subject, body, status, provider, provider_message_id, error, created_at, sent_at
    ) VALUES (
      ${entry.id}, ${entry.to}, ${entry.subject}, ${entry.body}, ${entry.status},
      ${entry.provider ?? null}, ${entry.providerMessageId ?? null}, ${entry.error ?? null},
      ${entry.createdAt}, ${entry.sentAt ?? null}
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      provider = EXCLUDED.provider,
      provider_message_id = EXCLUDED.provider_message_id,
      error = EXCLUDED.error,
      sent_at = EXCLUDED.sent_at
  `;
}

async function deliverViaResend(entry: EmailOutboxEntry) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const from = process.env.RESEND_FROM_EMAIL || 'GridStore <onboarding@resend.dev>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [entry.to],
      subject: entry.subject,
      text: entry.body,
    }),
  });
  const body = (await response.json()) as { id?: string; message?: string };
  if (!response.ok) {
    throw new Error(body.message || `Resend failed (${response.status})`);
  }
  return { provider: 'resend', messageId: body.id };
}

async function deliverViaWebhook(entry: EmailOutboxEntry) {
  const webhook = process.env.TRANSACTIONAL_EMAIL_WEBHOOK;
  if (!webhook) return null;
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: entry.id,
      to: entry.to,
      subject: entry.subject,
      body: entry.body,
      createdAt: entry.createdAt,
    }),
  });
  if (!response.ok) {
    throw new Error(`Email webhook failed (${response.status})`);
  }
  return { provider: 'webhook', messageId: entry.id };
}

export async function queueTransactionalEmail(input: {
  to: string;
  subject: string;
  body: string;
}): Promise<EmailOutboxEntry> {
  const entry: EmailOutboxEntry = {
    id: createId('email'),
    to: input.to,
    subject: input.subject,
    body: input.body,
    status: 'queued',
    createdAt: new Date().toISOString(),
  };
  memoryOutbox.unshift(entry);
  await persistEntry(entry);
  logger.info('Transactional email queued', { to: input.to, subject: input.subject, id: entry.id });

  // Attempt immediate delivery when a provider is configured.
  try {
    await deliverQueuedEmail(entry.id);
  } catch {
    // Worker will retry.
  }
  return entry;
}

export async function deliverQueuedEmail(id: string) {
  let entry = memoryOutbox.find((item) => item.id === id);
  if (!entry && hasDatabase()) {
    const rows = (await requireSql()`
      SELECT * FROM gridstore_email_outbox WHERE id = ${id} LIMIT 1
    `) as Record<string, unknown>[];
    if (rows[0]) entry = rowToEntry(rows[0]);
  }
  if (!entry) throw new Error('Email not found');
  if (entry.status === 'sent') return entry;

  try {
    const result = (await deliverViaResend(entry)) ?? (await deliverViaWebhook(entry));
    if (!result) {
      // No provider configured — leave queued for local/dev inspection.
      return entry;
    }
    entry.status = 'sent';
    entry.provider = result.provider;
    entry.providerMessageId = result.messageId;
    entry.sentAt = new Date().toISOString();
    entry.error = undefined;
  } catch (error) {
    entry.status = 'failed';
    entry.error = error instanceof Error ? error.message : 'Email delivery failed';
    await persistEntry(entry);
    throw error;
  }

  const idx = memoryOutbox.findIndex((item) => item.id === id);
  if (idx >= 0) memoryOutbox[idx] = entry;
  else memoryOutbox.unshift(entry);
  await persistEntry(entry);
  return entry;
}

export async function drainEmailOutbox(limit = 20) {
  let queued: EmailOutboxEntry[] = memoryOutbox.filter((item) => item.status === 'queued').slice(0, limit);
  if (hasDatabase()) {
    const rows = (await requireSql()`
      SELECT * FROM gridstore_email_outbox
      WHERE status = 'queued'
      ORDER BY created_at ASC
      LIMIT ${limit}
    `) as Record<string, unknown>[];
    queued = rows.map(rowToEntry);
  }

  let sent = 0;
  for (const entry of queued) {
    try {
      const result = await deliverQueuedEmail(entry.id);
      if (result.status === 'sent') sent += 1;
    } catch {
      // continue remaining
    }
  }
  return { attempted: queued.length, sent };
}

export function listEmailOutboxEntries(limit = 100) {
  return memoryOutbox.slice(0, limit);
}

export function resetEmailOutboxForTests() {
  memoryOutbox.length = 0;
}
