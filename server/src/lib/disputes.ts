import { createId } from './ids.js';
import { hasDatabase, requireSql } from '../db/client.js';
import { platformStore } from '../store/index.js';
import { recordSecurityEvent } from './security.js';

export type DisputeStatus = 'open' | 'under_review' | 'resolved_buyer' | 'resolved_seller' | 'closed';

export interface DisputeCase {
  id: string;
  orderId: string;
  openedBy: string;
  reason: string;
  status: DisputeStatus;
  evidence: Array<{ id: string; note: string; createdAt: string; actorId: string }>;
  createdAt: string;
  updatedAt: string;
}

const memoryDisputes: DisputeCase[] = [];

function rowToDispute(row: Record<string, unknown>, evidence: DisputeCase['evidence'] = []): DisputeCase {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    openedBy: String(row.opened_by),
    reason: String(row.reason),
    status: String(row.status) as DisputeStatus,
    evidence,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export async function openDispute(input: {
  orderId: string;
  openedBy: string;
  reason: string;
}) {
  const order = platformStore.listAllOrders().find((item) => item.id === input.orderId);
  if (!order) throw new Error('Order not found');
  if (order.userId !== input.openedBy) {
    const actor = platformStore.getUserById(input.openedBy);
    if (!actor || !['admin', 'moderator', 'seller'].includes(actor.role)) {
      throw new Error('Not allowed to open dispute for this order');
    }
  }
  if (!['paid', 'processing', 'shipped', 'delivered'].includes(order.status)) {
    throw new Error('Disputes can only be opened on fulfilled or paid orders');
  }

  const now = new Date().toISOString();
  const dispute: DisputeCase = {
    id: createId('disp'),
    orderId: input.orderId,
    openedBy: input.openedBy,
    reason: input.reason.trim(),
    status: 'open',
    evidence: [],
    createdAt: now,
    updatedAt: now,
  };
  memoryDisputes.unshift(dispute);
  if (hasDatabase()) {
    const db = requireSql();
    await db`
      INSERT INTO gridstore_disputes (id, order_id, opened_by, reason, status, created_at, updated_at)
      VALUES (
        ${dispute.id}, ${dispute.orderId}, ${dispute.openedBy}, ${dispute.reason},
        ${dispute.status}, ${dispute.createdAt}, ${dispute.updatedAt}
      )
    `;
  }
  recordSecurityEvent('dispute.opened', {
    actorId: input.openedBy,
    targetId: dispute.id,
    detail: { orderId: input.orderId },
  });
  return dispute;
}

export async function addDisputeEvidence(input: {
  disputeId: string;
  actorId: string;
  note: string;
}) {
  const dispute = await getDispute(input.disputeId);
  if (!dispute) throw new Error('Dispute not found');
  if (['resolved_buyer', 'resolved_seller', 'closed'].includes(dispute.status)) {
    throw new Error('Cannot add evidence to a closed dispute');
  }
  const evidence = {
    id: createId('evid'),
    note: input.note.trim(),
    createdAt: new Date().toISOString(),
    actorId: input.actorId,
  };
  dispute.evidence.push(evidence);
  dispute.updatedAt = evidence.createdAt;
  dispute.status = dispute.status === 'open' ? 'under_review' : dispute.status;
  if (hasDatabase()) {
    const db = requireSql();
    await db`
      INSERT INTO gridstore_dispute_evidence (id, dispute_id, actor_id, note, created_at)
      VALUES (${evidence.id}, ${dispute.id}, ${evidence.actorId}, ${evidence.note}, ${evidence.createdAt})
    `;
    await db`
      UPDATE gridstore_disputes SET status = ${dispute.status}, updated_at = ${dispute.updatedAt}
      WHERE id = ${dispute.id}
    `;
  }
  return dispute;
}

export async function resolveDispute(input: {
  disputeId: string;
  actorId: string;
  resolution: 'resolved_buyer' | 'resolved_seller' | 'closed';
}) {
  const dispute = await getDispute(input.disputeId);
  if (!dispute) throw new Error('Dispute not found');
  const actor = platformStore.getUserById(input.actorId);
  if (!actor || !['admin', 'moderator'].includes(actor.role)) {
    throw new Error('Only support staff can resolve disputes');
  }
  dispute.status = input.resolution;
  dispute.updatedAt = new Date().toISOString();
  if (hasDatabase()) {
    const db = requireSql();
    await db`
      UPDATE gridstore_disputes SET status = ${dispute.status}, updated_at = ${dispute.updatedAt}
      WHERE id = ${dispute.id}
    `;
  }
  recordSecurityEvent('dispute.resolved', {
    actorId: input.actorId,
    targetId: dispute.id,
    detail: { resolution: input.resolution },
  });
  return dispute;
}

export async function getDispute(id: string) {
  const memory = memoryDisputes.find((item) => item.id === id);
  if (memory) return memory;
  if (!hasDatabase()) return undefined;
  const db = requireSql();
  const rows = (await db`SELECT * FROM gridstore_disputes WHERE id = ${id} LIMIT 1`) as Record<
    string,
    unknown
  >[];
  if (!rows[0]) return undefined;
  const evidenceRows = (await db`
    SELECT * FROM gridstore_dispute_evidence WHERE dispute_id = ${id} ORDER BY created_at ASC
  `) as Record<string, unknown>[];
  const dispute = rowToDispute(
    rows[0],
    evidenceRows.map((row) => ({
      id: String(row.id),
      note: String(row.note),
      createdAt: String(row.created_at),
      actorId: String(row.actor_id),
    }))
  );
  memoryDisputes.push(dispute);
  return dispute;
}

export async function listDisputes(orderId?: string) {
  if (hasDatabase()) {
    const db = requireSql();
    const rows = (orderId
      ? await db`SELECT * FROM gridstore_disputes WHERE order_id = ${orderId} ORDER BY created_at DESC`
      : await db`SELECT * FROM gridstore_disputes ORDER BY created_at DESC`) as Record<string, unknown>[];
    return Promise.all(rows.map(async (row) => (await getDispute(String(row.id)))!));
  }
  return memoryDisputes.filter((item) => (orderId ? item.orderId === orderId : true));
}

export function resetDisputesForTests() {
  memoryDisputes.length = 0;
}
