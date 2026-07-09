import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(rootDir, 'admin'),
  envDir: rootDir,
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
  },
  build: {
    outDir: path.join(rootDir, 'dist-admin'),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
