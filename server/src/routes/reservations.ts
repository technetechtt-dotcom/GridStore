import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { userFeaturesStore } from '../store/userFeatures/index.js';

export const reservationsRouter = Router();

const reservationSchema = z.object({
  rentalId: z.string(),
  rentalTitle: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

reservationsRouter.use(requireAuth);

reservationsRouter.get('/', async (req: AuthenticatedRequest, res) => {
  const items = await userFeaturesStore.listReservations(req.user!.id);
  res.json(items);
});

reservationsRouter.post('/', async (req: AuthenticatedRequest, res) => {
  const parsed = reservationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid reservation payload' });
    return;
  }

  const reservation = await userFeaturesStore.createReservation(req.user!.id, parsed.data);
  res.status(201).json(reservation);
});
