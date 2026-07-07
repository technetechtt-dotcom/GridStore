import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const bookingsRouter = Router();

const bookingSchema = z.object({
  serviceId: z.string(),
  serviceTitle: z.string(),
  provider: z.string(),
  requestedDate: z.string().optional(),
  note: z.string().optional(),
});

bookingsRouter.use(requireAuth);

bookingsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const items = await userFeaturesStore.listBookings(req.user!.id);
  res.json(items);
});

bookingsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid booking payload' });
    return;
  }

  const booking = await userFeaturesStore.createBooking(req.user!.id, {
    serviceId: parsed.data.serviceId,
    serviceTitle: parsed.data.serviceTitle,
    provider: parsed.data.provider,
    requestedDate: parsed.data.requestedDate ?? 'Next available',
    note: parsed.data.note?.trim() || 'Please send a quote and available times.',
  });
  res.status(201).json(booking);
});
