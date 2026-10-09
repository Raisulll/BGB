import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // The SPA calls /api/v1 on its own origin, so the refresh cookie stays first-party (SameSite=Strict).
  // In development Vite forwards /api to the BIRDS API; in production Nginx does (CLAUDE.md §15).
  // ws: the realtime channel (/api/v1/ws) for messages and calls goes through the same proxy.
  const apiTarget = env.BIRDS_API_TARGET || 'http://localhost:4000';

  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false, xfwd: true, ws: true },
      },
    },
    preview: {
      proxy: {
        '/api': { target: apiTarget, changeOrigin: false, xfwd: true, ws: true },
      },
    },
  };
});
