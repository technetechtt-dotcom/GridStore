import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger, recordSecurityEvent, responseContainsSensitiveData } from './lib/security.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { areStoresReady } from './storeReadiness.js';
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
import { sellerApplicationsRouter } from './routes/sellerApplications.js';
import { servicesRouter } from './routes/services.js';
import { storesRouter } from './routes/stores.js';
import { wishlistRouter } from './routes/wishlist.js';

function isAllowedCorsOrigin(origin?: string) {
  if (!origin) return true;

  try {
    new URL(origin);
  } catch {
    return false;
  }

  if (env.corsOrigin === '*') {
    return !env.isProduction;
  }

  return env.corsOrigins.includes(origin) || (env.corsOrigin ? origin === env.corsOrigin : false);
}

function isCatalogPath(path: string) {
  return /^\/(products|services|rentals|jobs)(\/|$)/.test(path);
}

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body: unknown) => {
      if (responseContainsSensitiveData(body)) {
        logger.error('Blocked sensitive response payload', { requestId: req.requestId, path: req.path });
        return originalJson({ error: 'Internal server error', requestId: req.requestId });
      }
      return originalJson(body);
    }) as typeof res.json;
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", ...env.corsOrigins],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        recordSecurityEvent('cors.rejected', { detail: { origin } });
        callback(new Error('Not allowed by CORS'));
      },
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Accept',
        'X-Session-Token',
        'X-Request-Id',
        'X-MFA-Token',
      ],
      optionsSuccessStatus: 204,
    })
  );

  app.use(express.json({ limit: env.jsonBodyLimit }));
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (error instanceof SyntaxError && 'body' in error) {
      res.status(400).json({ error: 'Invalid JSON payload' });
      return;
    }
    next(error);
  });

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' },
  });
  const sensitiveLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sensitive requests' },
  });
  const aiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'AI rate limit exceeded' },
  });
  const bidLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Bid rate limit exceeded' },
  });

  app.use('/api', globalLimiter);

  const api = express.Router();
  api.use(healthRouter);
  api.use((req, res, next) => {
    if (areStoresReady() || req.path === '/health' || isCatalogPath(req.path)) {
      next();
      return;
    }

    res.status(503).json({
      error: 'API is starting up',
      status: 'starting',
      service: 'gridstore-api',
    });
  });
  api.use('/auth', sensitiveLimiter, authRouter);
  api.use('/seller-applications', sellerApplicationsRouter);
  api.use('/offers', offersRouter);
  api.use('/auctions', bidLimiter, auctionsRouter);
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
  api.use('/ai', aiLimiter, aiRouter);

  app.use('/api', api);

  app.use((error: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const origin = req.headers.origin;
    if (typeof origin === 'string' && isAllowedCorsOrigin(origin) && !res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }

    if (error instanceof Error && error.message === 'Not allowed by CORS') {
      res.status(403).json({ error: 'Not allowed by CORS', requestId: req.requestId });
      return;
    }

    next(error);
  });

  app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled API error', {
      requestId: req.requestId,
      path: req.path,
      method: req.method,
      error: error instanceof Error ? error.message : 'unknown',
    });
    if (res.headersSent) return;
    res.status(500).json({
      error: 'Internal server error',
      requestId: req.requestId,
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return app;
}
