import { Router } from 'express';
import { catalogStore } from '../store/catalogStore.js';

export const jobsRouter = Router();

jobsRouter.get('/', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(catalogStore.listJobs(q));
});

jobsRouter.get('/:id', (req, res) => {
  const job = catalogStore.getJob(req.params.id);
  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }
  res.json(job);
});
