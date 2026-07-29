import { createId } from '../ids.js';
import type { CarrierShipment, CreateShipmentInput } from './types.js';

const labels = new Map<string, { orderId: string; trackingNumber: string; html: string; createdAt: string }>();

export function createSandboxShipment(input: CreateShipmentInput): CarrierShipment {
  const trackingNumber = `GS-SBX-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
  const labelId = createId('label');
  const createdAt = new Date().toISOString();
  const safeAddress = input.deliveryAddress.replace(/[<>&]/g, (ch) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[ch] ?? ch
  );
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>GridStore Sandbox Label</title>
<style>
  body{font-family:ui-sans-serif,system-ui,sans-serif;padding:32px;color:#111}
  .box{border:2px solid #111;padding:24px;max-width:420px}
  h1{font-size:18px;margin:0 0 12px}
  code{font-size:20px;letter-spacing:1px}
</style></head><body>
<div class="box">
  <h1>GridStore Sandbox Shipping Label</h1>
  <p><strong>Order</strong> ${input.orderId}</p>
  <p><strong>Tracking</strong><br><code>${trackingNumber}</code></p>
  <p><strong>Ship to</strong><br>${safeAddress}</p>
  <p style="font-size:12px;color:#555">Generated ${createdAt} · not a real carrier label</p>
</div>
</body></html>`;

  labels.set(labelId, { orderId: input.orderId, trackingNumber, html, createdAt });
  return {
    carrier: 'GridStore Sandbox Courier',
    trackingNumber,
    labelId,
    labelUrl: sandboxLabelPublicPath(labelId),
    status: 'label_created',
  };
}

export function sandboxLabelPublicPath(labelId: string) {
  return `/api/platform/shipping/labels/${labelId}`;
}

export function getSandboxLabel(labelId: string) {
  return labels.get(labelId);
}

export function resetSandboxCarrierForTests() {
  labels.clear();
}
