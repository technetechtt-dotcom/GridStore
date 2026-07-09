import { Router } from 'express';
import { env } from '../config/env.js';
import { areStoresReady } from '../storeReadiness.js';

export const healthRouter = Router();

healthRouter.get('/health', (_req, res) => {
  const ready = areStoresReady();
  res.json({
    status: ready ? 'ok' : 'starting',
    ready,
    service: 'gridstore-api',
    marketplaceUrl: process.env.PUBLIC_WEB_URL ?? env.publicWebUrl,
    opsDashboardUrl: process.env.PUBLIC_ADMIN_URL ?? env.publicAdminUrl,
    timestamp: new Date().toISOString(),
  });
});
