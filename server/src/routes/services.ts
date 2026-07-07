import { Router } from 'express';
import { catalogStore } from '../store/catalogStore.js';

export const servicesRouter = Router();

servicesRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(catalogStore.listServices(q));
});

servicesRouter.get('/:id', (req, res) => {
  const service = catalogStore.getService(req.params.id);
  if (!service) {
    res.status(404).json({ error: 'Service not found' });
    return;
  }
  res.json(service);
});
