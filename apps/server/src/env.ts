import { z } from 'zod';
import type { Env } from './types';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  REDIS_URL: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3001),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  WEB_DIST: z.string().default('apps/web/dist'),
  RATE_LIMIT_ENABLED: z.enum(['0', '1']).default('1'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

/** 启动即校验，失败退出（07 §2） */
export function loadEnv(source: Record<string, string | undefined> = Bun.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    console.error('[env] invalid environment:', JSON.stringify(parsed.error.issues, null, 2));
    process.exit(1);
  }
  const e = parsed.data;
  return {
    DATABASE_URL: e.DATABASE_URL,
    JWT_SECRET: e.JWT_SECRET,
    REDIS_URL: e.REDIS_URL,
    PORT: e.PORT,
    FRONTEND_URL: e.FRONTEND_URL,
    WEB_DIST: e.WEB_DIST,
    rateLimitEnabled: e.RATE_LIMIT_ENABLED === '1',
    LOG_LEVEL: e.LOG_LEVEL,
  };
}
