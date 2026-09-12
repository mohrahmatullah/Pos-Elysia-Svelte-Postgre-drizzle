import { app } from './app';
import { config } from './config';

const server = Bun.serve({
  port: config.port,
  fetch: app.fetch,
});

console.log(`🚀 POS API running at http://localhost:${server.port} (${config.env})`);
