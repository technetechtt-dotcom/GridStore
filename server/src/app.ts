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

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) {
          callback(null, true);
          return;
        }

        let hostname = '';
        try {
          hostname = new URL(origin).hostname;
        } catch {
          callback(new Error('Not allowed by CORS'));
          return;
        }

        if (
          /^localhost$/.test(hostname) ||
          /^127\.0\.0\.1$/.test(hostname) ||
          env.corsOrigin === '*' ||
          env.corsOrigins.includes(origin) ||
          origin === env.corsOrigin ||
          hostname.endsWith('.onrender.com')
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
