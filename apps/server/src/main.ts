import { env } from './config/env.js';
import { pool } from './db/client.js';
import { createApp } from './http/app.js';
import { recoverPendingJobs } from './jobs/queue.js';
import { ensureUploadRoot } from './modules/documents/storage.js';

async function main(): Promise<void> {
  await ensureUploadRoot();
  await pool.query('select 1');
  await recoverPendingJobs();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[server] listening on http://localhost:${env.PORT} (provider: ${env.LLM_PROVIDER})`);
  });

  const shutdown = (signal: string): void => {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
