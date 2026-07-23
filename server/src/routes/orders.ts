import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { platformStore } from '../store/index.js';

export const ordersRouter = Router();

const checkoutLineSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
});

const createOrderSchema = z.object({
  deliveryAddress: z.string().min(3),
  paymentMethod: z.string().min(1),
  lines: z.array(checkoutLineSchema).min(1),
  idempotencyKey: z.string().min(8).max(128).optional(),
});

const transitionSchema = z.object({
  action: z.enum([
    'confirm_payment',
    'start_processing',
    'ship',
    'deliver',
    'cancel',
    'refund',
  ]),
  trackingNumber: z.string().min(3).max(120).optional(),
});

ordersRouter.use(requireAuth);

ordersRouter.get('/', (req: AuthenticatedRequest, res) => {
  const orders = platformStore.listOrders(req.user!.id).map(stripUserId);
  res.json(orders);
});

ordersRouter.get('/:id', (req: AuthenticatedRequest, res) => {
  const order = platformStore.getOrder(req.user!.id, req.params.id);
  if (!order) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json(stripUserId(order));
});

ordersRouter.get('/:id/events', (req: AuthenticatedRequest, res) => {
  const order = platformStore.getOrder(req.user!.id, req.params.id);
  const isStaff = req.user!.role === 'admin' || req.user!.role === 'moderator';
  if (!order && !isStaff) {
    res.status(404).json({ error: 'Order not found' });
    return;
  }
  res.json(platformStore.listOrderEvents(req.params.id));
});

ordersRouter.post('/:id/transitions', async (req: AuthenticatedRequest, res) => {
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid transition payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const order = await platformStore.transitionOrder(
      { userId: req.user!.id, role: req.user!.role },
      req.params.id,
      parsed.data.action,
      { trackingNumber: parsed.data.trackingNumber }
    );
    if (order.userId !== req.user!.id && !['admin', 'moderator', 'seller'].includes(req.user!.role)) {
      res.status(404).json({ error: 'Order not found' });
      return;
    }
    res.json(stripUserId(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to transition order';
    const status = /not found/i.test(message) ? 404 : 400;
    res.status(status).json({ error: message });
  }
});

ordersRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = createOrderSchema.safeParse({
    ...req.body,
    idempotencyKey: req.body?.idempotencyKey ?? req.header('idempotency-key') ?? undefined,
  });
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid order payload', details: parsed.error.flatten() });
    return;
  }

  try {
    const order = await platformStore.createOrder(req.user!.id, parsed.data);
    res.status(201).json(stripUserId(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create order';
    res.status(400).json({ error: message });
  }
});

ordersRouter.post('/:id/cancel', async (req: AuthenticatedRequest, res) => {
  try {
    const order = await platformStore.transitionOrder(
      { userId: req.user!.id, role: req.user!.role },
      req.params.id,
      'cancel'
    );
    res.json(stripUserId(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cancel order';
    res.status(400).json({ error: message });
  }
});

ordersRouter.post('/:id/refund', async (req: AuthenticatedRequest, res) => {
  try {
    const order = await platformStore.refundOrder(req.user!.id, req.params.id);
    res.json(stripUserId(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refund order';
    res.status(400).json({ error: message });
  }
});

function stripUserId<T extends { userId?: string }>(order: T) {
  const { userId: _userId, ...rest } = order;
  return rest;
}
