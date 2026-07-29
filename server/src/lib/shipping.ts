import { createId } from './ids.js';
import { hasDatabase, requireSql } from '../db/client.js';
import { platformStore } from '../store/index.js';
import { recordSecurityEvent } from './security.js';

export interface ShippingEvent {
  id: string;
  orderId: string;
  status: string;
  carrier?: string;
  trackingNumber?: string;
  location?: string;
  note?: string;
  createdAt: string;
  actorId: string;
}

const memoryEvents: ShippingEvent[] = [];

export async function addShippingEvent(input: {
  orderId: string;
  actorId: string;
  status: string;
  carrier?: string;
  trackingNumber?: string;
  location?: string;
  note?: string;
}) {
  const order = platformStore.listAllOrders().find((item) => item.id === input.orderId);
  if (!order) throw new Error('Order not found');

  const event: ShippingEvent = {
    id: createId('ship'),
    orderId: input.orderId,
    status: input.status.trim(),
    carrier: input.carrier?.trim(),
    trackingNumber: input.trackingNumber?.trim(),
    location: input.location?.trim(),
    note: input.note?.trim(),
    createdAt: new Date().toISOString(),
    actorId: input.actorId,
  };
  memoryEvents.unshift(event);

  if (input.trackingNumber) {
    order.trackingNumber = input.trackingNumber;
  }

  if (hasDatabase()) {
    const db = requireSql();
    await db`
      INSERT INTO gridstore_shipping_events (
        id, order_id, status, carrier, tracking_number, location, note, actor_id, created_at
      ) VALUES (
        ${event.id}, ${event.orderId}, ${event.status}, ${event.carrier ?? null},
        ${event.trackingNumber ?? null}, ${event.location ?? null}, ${event.note ?? null},
        ${event.actorId}, ${event.createdAt}
      )
    `;
    if (input.trackingNumber) {
      await db`
        UPDATE gridstore_orders SET tracking_number = ${input.trackingNumber} WHERE id = ${input.orderId}
      `;
    }
  }

  recordSecurityEvent('shipping.event', {
    actorId: input.actorId,
    targetId: input.orderId,
    detail: { status: event.status, trackingNumber: event.trackingNumber },
  });

  const { notifyUser } = await import('./commerceNotify.js');
  await notifyUser({
    userId: order.userId,
    title: `Shipment ${event.status}`,
    description: event.trackingNumber
      ? `Order ${order.id}: ${event.status} · tracking ${event.trackingNumber}`
      : `Order ${order.id}: ${event.status}`,
    emailSubject: `Shipping update — ${order.id}`,
    emailBody: [
      `Order: ${order.id}`,
      `Status: ${event.status}`,
      event.carrier ? `Carrier: ${event.carrier}` : null,
      event.trackingNumber ? `Tracking: ${event.trackingNumber}` : null,
      event.location ? `Location: ${event.location}` : null,
      event.note ? `Note: ${event.note}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  });
  return event;
}

export async function listShippingEvents(orderId: string) {
  if (hasDatabase()) {
    const db = requireSql();
    const rows = (await db`
      SELECT * FROM gridstore_shipping_events WHERE order_id = ${orderId} ORDER BY created_at ASC
    `) as Record<string, unknown>[];
    return rows.map((row) => ({
      id: String(row.id),
      orderId: String(row.order_id),
      status: String(row.status),
      carrier: row.carrier ? String(row.carrier) : undefined,
      trackingNumber: row.tracking_number ? String(row.tracking_number) : undefined,
      location: row.location ? String(row.location) : undefined,
      note: row.note ? String(row.note) : undefined,
      createdAt: String(row.created_at),
      actorId: String(row.actor_id),
    }));
  }
  return memoryEvents
    .filter((event) => event.orderId === orderId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function findOrderIdByTrackingNumber(trackingNumber: string) {
  const needle = trackingNumber.trim();
  if (!needle) return undefined;

  if (hasDatabase()) {
    const db = requireSql();
    const eventRows = (await db`
      SELECT order_id FROM gridstore_shipping_events
      WHERE tracking_number = ${needle}
      ORDER BY created_at DESC
      LIMIT 1
    `) as Array<{ order_id: string }>;
    if (eventRows[0]) return eventRows[0].order_id;
    const orderRows = (await db`
      SELECT id FROM gridstore_orders WHERE tracking_number = ${needle} LIMIT 1
    `) as Array<{ id: string }>;
    if (orderRows[0]) return orderRows[0].id;
  }

  const fromEvent = memoryEvents.find((event) => event.trackingNumber === needle);
  if (fromEvent) return fromEvent.orderId;
  return platformStore.listAllOrders().find((order) => order.trackingNumber === needle)?.id;
}

export function resetShippingForTests() {
  memoryEvents.length = 0;
}
