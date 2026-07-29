import { Router } from 'express';
import { env } from '../config/env.js';
import { areStoresReady } from '../storeReadiness.js';
import { collectMonitoringSnapshot } from '../lib/monitoring.js';

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

healthRouter.get('/health/deep', async (_req, res) => {
  if (!areStoresReady()) {
    res.status(503).json({ status: 'starting', ready: false });
    return;
  }
  const monitoring = await collectMonitoringSnapshot();
  const degraded = monitoring.alerts.length > 0;
  res.status(degraded ? 503 : 200).json({
    status: degraded ? 'degraded' : 'ok',
    ready: true,
    monitoring,
  });
});
