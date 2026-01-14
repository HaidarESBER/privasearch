import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In production the app is served by nginx, which proxies /api to the API
// container. For local `npm run dev` we proxy /api to a locally-run API.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
