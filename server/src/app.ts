import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { aiRouter } from './routes/ai.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { jobsRouter } from './routes/jobs.js';
import { listingsRouter } from './routes/listings.js';
import { ordersRouter } from './routes/orders.js';
import { productsRouter } from './routes/products.js';
import { rentalsRouter } from './routes/rentals.js';
import { servicesRouter } from './routes/services.js';
import { storesRouter } from './routes/stores.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (
          !origin ||
          /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
          /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
          env.corsOrigin === '*' ||
          origin === env.corsOrigin
        ) {
          callback(null, true);
          return;
        }
        callback(new Error('Not allowed by CORS'));
      },
    })
  );
  app.use(express.json());

  const api = express.Router();
  api.use(healthRouter);
  api.use('/auth', authRouter);
  api.use('/orders', ordersRouter);
  api.use('/listings', listingsRouter);
  api.use('/products', productsRouter);
  api.use('/services', servicesRouter);
  api.use('/rentals', rentalsRouter);
  api.use('/jobs', jobsRouter);
  api.use('/stores', storesRouter);
  api.use('/ai', aiRouter);

  app.use('/api', api);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
