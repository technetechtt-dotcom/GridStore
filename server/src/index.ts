import { createApp } from './app.js';
import { assertSecurityConfig, env } from './config/env.js';
import { setStoresReady } from './storeReadiness.js';
import { logger } from './lib/security.js';
import { initPlatformStore } from './store/index.js';
import { initUserFeaturesStore } from './store/userFeatures/index.js';
import { initStoresStore } from './store/stores/index.js';
import { initTradeStore } from './store/trade/index.js';

async function initializeStores(attempt = 1) {
  try {
    await initPlatformStore();
    await initUserFeaturesStore();
    await initTradeStore();
    await initStoresStore();
    setStoresReady(true);
    logger.info('Platform stores ready', { demoData: env.enableDemoData });
  } catch (error) {
    setStoresReady(false);
    logger.error(`Failed to initialize platform stores (attempt ${attempt})`, {
      error: error instanceof Error ? error.message : 'unknown',
    });

    const retryDelayMs = Math.min(10_000 * attempt, 60_000);
    globalThis.setTimeout(() => {
      void initializeStores(attempt + 1);
    }, retryDelayMs);
  }
}

async function start() {
  assertSecurityConfig();
  setStoresReady(false);
  const app = createApp();

  app.listen(env.port, () => {
    logger.info(`GridStore API listening on http://localhost:${env.port}/api`);
  });

  void initializeStores();
}

start().catch((error) => {
  logger.error('Failed to start API server', {
    error: error instanceof Error ? error.message : 'unknown',
  });
  process.exit(1);
});
