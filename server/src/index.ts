import { createApp } from './app.js';
import { env } from './config/env.js';
import { initPlatformStore } from './store/index.js';

async function start() {
  await initPlatformStore();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`GridStore API listening on http://localhost:${env.port}/api`);
  });
}

start().catch((error) => {
  console.error('Failed to start API server:', error);
  process.exit(1);
});
