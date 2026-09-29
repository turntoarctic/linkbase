import { loadEnv } from './env';
import { createDb } from '@linkbase/database';
import { createKV } from './db/redis';
import { createLogger } from './lib/logger';
import { createApp } from './app';
import { scheduleJobs } from './services/jobs';

/** 启动（07 §2）：一个 Bun.serve 进程提供 REST（+ Phase 2 WS）+ 静态产物 */
const env = loadEnv();
const { db, client } = createDb(env.DATABASE_URL);
const kv = createKV(env.REDIS_URL);
if (!env.REDIS_URL) {
  console.warn('[redis] REDIS_URL not set — using in-memory fallback (dev only, 07 §3)');
}
const logger = createLogger(env.LOG_LEVEL);
const app = createApp({ env, db, kv, logger });

const server = Bun.serve({
  port: env.PORT,
  fetch: app.fetch,
  // doc update 512KB / blob 25MB 之外的总兜底（07 §3）
  maxRequestBodySize: 30 * 1024 * 1024,
});

logger.info({ port: env.PORT }, `linkbase server listening on :${env.PORT}`);
scheduleJobs({ env, db, kv, logger });

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  server.stop(true); // Phase 2 在飞请求排空 + WS 房间广播（07 §10）
  kv.close();
  client.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
