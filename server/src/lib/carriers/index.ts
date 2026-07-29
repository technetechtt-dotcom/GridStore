import { createSandboxShipment, sandboxLabelPublicPath } from './sandbox.js';
import type { CarrierShipment, CreateShipmentInput } from './types.js';

export type ShippingProvider = 'sandbox' | 'manual';

export function shippingProvider(): ShippingProvider {
  const value = (process.env.SHIPPING_PROVIDER ?? 'sandbox').toLowerCase();
  if (value === 'manual') return 'manual';
  return 'sandbox';
}

export async function createCarrierShipment(input: CreateShipmentInput): Promise<CarrierShipment | null> {
  if (shippingProvider() === 'manual') return null;
  const shipment = createSandboxShipment(input);
  return {
    ...shipment,
    labelUrl: sandboxLabelPublicPath(shipment.labelId),
  };
}

export { getSandboxLabel, resetSandboxCarrierForTests } from './sandbox.js';
export type { CarrierShipment, CreateShipmentInput } from './types.js';
