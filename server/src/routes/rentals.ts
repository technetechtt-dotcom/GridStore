import { Router } from 'express';
import { catalogStore } from '../store/catalogStore.js';

export const rentalsRouter = Router();

rentalsRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(catalogStore.listRentals(q));
});

rentalsRouter.get('/:id', (req, res) => {
  const rental = catalogStore.getRental(req.params.id);
  if (!rental) {
    res.status(404).json({ error: 'Rental not found' });
    return;
  }
  res.json(rental);
});
