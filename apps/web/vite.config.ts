import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit(), tailwindcss()],
  server: {
    port: 3000,
    // Proxy API calls so the browser talks same-origin (/api/...) — no CORS
    // preflight (OPTIONS) on every request. Server-to-server has no CORS.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
