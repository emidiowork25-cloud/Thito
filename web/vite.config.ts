import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const backend = process.env.THITO_BACKEND ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: true, ws: true },
      '/preview': { target: backend, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
