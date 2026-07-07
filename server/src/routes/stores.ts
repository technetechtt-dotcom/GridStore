import { Router } from 'express';
import { catalogStore } from '../store/catalogStore.js';

export const storesRouter = Router();

storesRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(catalogStore.listStores(q));
});

storesRouter.get('/:id', (req, res) => {
  const store = catalogStore.getStore(req.params.id);
  if (!store) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }
  res.json(store);
});
