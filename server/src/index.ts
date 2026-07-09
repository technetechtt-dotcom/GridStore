import { createApp, setStoresReady } from './app.js';
import { env } from './config/env.js';
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
    console.log('Platform stores ready');
  } catch (error) {
    setStoresReady(false);
    console.error(`Failed to initialize platform stores (attempt ${attempt}):`, error);

    const retryDelayMs = Math.min(10_000 * attempt, 60_000);
    globalThis.setTimeout(() => {
      void initializeStores(attempt + 1);
    }, retryDelayMs);
  }
}

async function start() {
  setStoresReady(false);
  const app = createApp();

  app.listen(env.port, () => {
    console.log(`GridStore API listening on http://localhost:${env.port}/api`);
  });

  void initializeStores();
}

start().catch((error) => {
  console.error('Failed to start API server:', error);
  process.exit(1);
});
