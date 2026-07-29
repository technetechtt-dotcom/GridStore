export interface CarrierShipment {
  carrier: string;
  trackingNumber: string;
  labelId: string;
  labelUrl: string;
  status: string;
}

export interface CreateShipmentInput {
  orderId: string;
  deliveryAddress: string;
  actorId: string;
}
