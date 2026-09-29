import type { Database } from '@linkbase/database';
import type { KV } from './db/redis';
import type { Logger } from './lib/logger';

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  REDIS_URL?: string;
  PORT: number;
  FRONTEND_URL: string;
  WEB_DIST: string;
  rateLimitEnabled: boolean;
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
}

export interface AppDeps {
  env: Env;
  db: Database;
  kv: KV;
  logger: Logger;
}

/** Hono 变量（07 §2：auth 注入 user，workspace 注入角色） */
export interface AppState {
  Variables: {
    reqId: string;
    userId: string;
    wsId: string;
    wsRole: 'owner' | 'admin' | 'member';
  };
}
