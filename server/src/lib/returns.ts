import { createId } from './ids.js';
import { hasDatabase, requireSql } from '../db/client.js';
import { platformStore } from '../store/index.js';
import { recordSecurityEvent } from './security.js';

export type ReturnStatus =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'item_shipped'
  | 'received'
  | 'refunded'
  | 'closed';

export interface ReturnRequest {
  id: string;
  orderId: string;
  buyerId: string;
  reason: string;
  status: ReturnStatus;
  windowExpiresAt: string;
  rmaCode: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

const memoryReturns: ReturnRequest[] = [];
const RETURN_WINDOW_DAYS = Number(process.env.RETURN_WINDOW_DAYS ?? '14');

function rowToReturn(row: Record<string, unknown>): ReturnRequest {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    buyerId: String(row.buyer_id),
    reason: String(row.reason),
    status: String(row.status) as ReturnStatus,
    windowExpiresAt: String(row.window_expires_at),
    rmaCode: String(row.rma_code),
    notes: row.notes ? String(row.notes) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

async function persistReturn(item: ReturnRequest) {
  if (!hasDatabase()) return;
  const db = requireSql();
  await db`
    INSERT INTO gridstore_returns (
      id, order_id, buyer_id, reason, status, window_expires_at, rma_code, notes, created_at, updated_at
    ) VALUES (
      ${item.id}, ${item.orderId}, ${item.buyerId}, ${item.reason}, ${item.status},
      ${item.windowExpiresAt}, ${item.rmaCode}, ${item.notes ?? null}, ${item.createdAt}, ${item.updatedAt}
    )
    ON CONFLICT (id) DO UPDATE SET
      status = EXCLUDED.status,
      notes = EXCLUDED.notes,
      updated_at = EXCLUDED.updated_at
  `;
}

export async function getReturn(id: string) {
  const memory = memoryReturns.find((item) => item.id === id);
  if (memory) return memory;
  if (!hasDatabase()) return undefined;
  const rows = (await requireSql()`
    SELECT * FROM gridstore_returns WHERE id = ${id} LIMIT 1
  `) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  const item = rowToReturn(rows[0]);
  memoryReturns.push(item);
  return item;
}

export async function listReturns(filter?: { orderId?: string; buyerId?: string }) {
  if (hasDatabase()) {
    const db = requireSql();
    let rows: Record<string, unknown>[];
    if (filter?.orderId) {
      rows = (await db`
        SELECT * FROM gridstore_returns WHERE order_id = ${filter.orderId} ORDER BY created_at DESC
      `) as Record<string, unknown>[];
    } else if (filter?.buyerId) {
      rows = (await db`
        SELECT * FROM gridstore_returns WHERE buyer_id = ${filter.buyerId} ORDER BY created_at DESC
      `) as Record<string, unknown>[];
    } else {
      rows = (await db`
        SELECT * FROM gridstore_returns ORDER BY created_at DESC LIMIT 200
      `) as Record<string, unknown>[];
    }
    return rows.map(rowToReturn);
  }
  return memoryReturns.filter((item) => {
    if (filter?.orderId && item.orderId !== filter.orderId) return false;
    if (filter?.buyerId && item.buyerId !== filter.buyerId) return false;
    return true;
  });
}

export async function openReturnRequest(input: {
  orderId: string;
  buyerId: string;
  reason: string;
}) {
  const order = platformStore.listAllOrders().find((item) => item.id === input.orderId);
  if (!order) throw new Error('Order not found');
  if (order.userId !== input.buyerId) {
    throw new Error('Only the buyer can open a return for this order');
  }
  if (!['delivered', 'shipped'].includes(order.status)) {
    throw new Error('Returns can only be opened after shipping or delivery');
  }

  const deliveredEvent = platformStore
    .listOrderEvents(order.id)
    .find((event) => event.toStatus === 'delivered' || event.type.includes('deliver'));
  const anchor = deliveredEvent?.createdAt ?? order.createdAt;
  const windowExpiresAt = new Date(
    new Date(anchor).getTime() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  if (Date.now() > new Date(windowExpiresAt).getTime()) {
    throw new Error(`Return window of ${RETURN_WINDOW_DAYS} days has expired`);
  }

  const existing = (await listReturns({ orderId: input.orderId })).find((item) =>
    !['rejected', 'closed', 'refunded'].includes(item.status)
  );
  if (existing) {
    throw new Error('An active return already exists for this order');
  }

  const now = new Date().toISOString();
  const item: ReturnRequest = {
    id: createId('rma'),
    orderId: input.orderId,
    buyerId: input.buyerId,
    reason: input.reason.trim(),
    status: 'requested',
    windowExpiresAt,
    rmaCode: `RMA-${Date.now().toString().slice(-8)}`,
    createdAt: now,
    updatedAt: now,
  };
  memoryReturns.unshift(item);
  await persistReturn(item);
  recordSecurityEvent('return.opened', {
    actorId: input.buyerId,
    targetId: item.id,
    detail: { orderId: input.orderId, rmaCode: item.rmaCode },
  });
  return item;
}

export async function transitionReturn(input: {
  returnId: string;
  actorId: string;
  action: 'approve' | 'reject' | 'mark_shipped' | 'mark_received' | 'refund' | 'close';
  notes?: string;
}) {
  const item = await getReturn(input.returnId);
  if (!item) throw new Error('Return not found');

  const actor = platformStore.getUserById(input.actorId);
  const isStaff = actor && ['admin', 'moderator'].includes(actor.role);
  const isBuyer = item.buyerId === input.actorId;

  const nextStatus = (() => {
    switch (input.action) {
      case 'approve':
        if (!isStaff) throw new Error('Only support staff can approve returns');
        if (item.status !== 'requested') throw new Error('Only requested returns can be approved');
        return 'approved' as const;
      case 'reject':
        if (!isStaff) throw new Error('Only support staff can reject returns');
        if (!['requested', 'approved'].includes(item.status)) {
          throw new Error('Return cannot be rejected in its current state');
        }
        return 'rejected' as const;
      case 'mark_shipped':
        if (!isBuyer && !isStaff) throw new Error('Not allowed to mark return shipped');
        if (item.status !== 'approved') throw new Error('Return must be approved before shipping');
        return 'item_shipped' as const;
      case 'mark_received':
        if (!isStaff) throw new Error('Only support staff can mark returns received');
        if (item.status !== 'item_shipped') throw new Error('Return must be in transit first');
        return 'received' as const;
      case 'refund':
        if (!isStaff) throw new Error('Only support staff can refund returns');
        if (!['received', 'approved'].includes(item.status)) {
          throw new Error('Return must be approved or received before refund');
        }
        return 'refunded' as const;
      case 'close':
        if (!isStaff) throw new Error('Only support staff can close returns');
        return 'closed' as const;
      default:
        throw new Error('Unsupported return action');
    }
  })();

  item.status = nextStatus;
  item.updatedAt = new Date().toISOString();
  if (input.notes?.trim()) item.notes = input.notes.trim();
  await persistReturn(item);

  if (nextStatus === 'refunded') {
    const { executeOrderRefund } = await import('../services/paymentService.js');
    await executeOrderRefund({ orderId: item.orderId, userId: input.actorId });
  }

  recordSecurityEvent('return.transition', {
    actorId: input.actorId,
    targetId: item.id,
    detail: { action: input.action, status: nextStatus },
  });
  return item;
}

export function resetReturnsForTests() {
  memoryReturns.length = 0;
}
