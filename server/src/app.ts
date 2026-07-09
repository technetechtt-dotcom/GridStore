import cors from 'cors';
import express from 'express';
import { env } from './config/env.js';
import { adminRouter } from './routes/admin.js';
import { aiRouter } from './routes/ai.js';
import { applicationsRouter } from './routes/applications.js';
import { authRouter } from './routes/auth.js';
import { bookingsRouter } from './routes/bookings.js';
import { cartRouter } from './routes/cart.js';
import { healthRouter } from './routes/health.js';
import { jobsRouter } from './routes/jobs.js';
import { listingsRouter } from './routes/listings.js';
import { messagesRouter } from './routes/messages.js';
import { notificationsRouter } from './routes/notifications.js';
import { auctionsRouter } from './routes/auctions.js';
import { offersRouter } from './routes/offers.js';
import { ordersRouter } from './routes/orders.js';
import { productsRouter } from './routes/products.js';
import { rentalsRouter } from './routes/rentals.js';
import { reportsRouter } from './routes/reports.js';
import { reservationsRouter } from './routes/reservations.js';
import { servicesRouter } from './routes/services.js';
import { storesRouter } from './routes/stores.js';
import { wishlistRouter } from './routes/wishlist.js';

function isAllowedCorsOrigin(origin?: string) {
  if (!origin) return true;

  let hostname = '';
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return false;
  }

  return (
    /^localhost$/.test(hostname) ||
    /^127\.0\.0\.1$/.test(hostname) ||
    env.corsOrigin === '*' ||
    env.corsOrigins.includes(origin) ||
    origin === env.corsOrigin ||
    hostname.endsWith('.onrender.com')
  );
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'X-Session-Token'],
      optionsSuccessStatus: 204,
    })
  );
  app.use(express.json());
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }

    next(error);
  });

  const api = express.Router();
  api.use(healthRouter);
  api.use('/auth', authRouter);
  api.use('/offers', offersRouter);
  api.use('/auctions', auctionsRouter);
  api.use('/orders', ordersRouter);
  api.use('/listings', listingsRouter);
  api.use('/cart', cartRouter);
  api.use('/wishlist', wishlistRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/messages', messagesRouter);
  api.use('/bookings', bookingsRouter);
  api.use('/reservations', reservationsRouter);
  api.use('/applications', applicationsRouter);
  api.use('/reports', reportsRouter);
  api.use('/admin', adminRouter);
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
