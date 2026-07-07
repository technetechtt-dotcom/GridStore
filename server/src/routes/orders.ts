import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { platformStore } from '../store/index.js';

export const ordersRouter = Router();

const orderLineSchema = z.object({
  productId: z.string(),
  title: z.string(),
  seller: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const createOrderSchema = z.object({
  deliveryAddress: z.string().min(3),
  paymentMethod: z.string().min(1),
  lines: z.array(orderLineSchema).min(1),
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

ordersRouter.patch('/:id/status', async (req: AuthenticatedRequest, res) => {
  const parsed = z
    .object({
      status: z.enum(['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'refunded']),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status payload' });
    return;
  }

  try {
    const order = await platformStore.updateOrderStatus(
      req.user!.id,
      req.params.id,
      parsed.data.status
    );
    res.json(stripUserId(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update order';
    res.status(404).json({ error: message });
  }
});

ordersRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = createOrderSchema.safeParse(req.body);
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

ordersRouter.post('/:id/refund', async (req: AuthenticatedRequest, res) => {
  try {
    const order = await platformStore.refundOrder(req.user!.id, req.params.id);
    res.json(stripUserId(order));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to refund order';
    res.status(404).json({ error: message });
  }
});

function stripUserId<T extends { userId?: string }>(order: T) {
  const { userId: _userId, ...rest } = order;
  return rest;
}
