import type { Context, Next } from 'hono';
import { AppError } from '../lib/errors';
import type { AppDeps } from '../types';

export interface RateLimitOptions {
  name: string;
  limit: number;
  windowSeconds: number;
}

function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

/** Redis 固定窗口限流（07 §3：全局 100/15min、login 5/min、register 3/h） */
export function rateLimit(deps: AppDeps, opts: RateLimitOptions) {
  return async (c: Context, next: Next) => {
    if (!deps.env.rateLimitEnabled) return next();
    const window = Math.floor(Date.now() / 1000 / opts.windowSeconds);
    const key = `rl:${opts.name}:${clientIp(c)}:${window}`;
    let count: number;
    try {
      count = await deps.kv.incr(key, opts.windowSeconds);
    } catch (err) {
      // 限流器故障不阻塞业务，只告警（07 §3：Redis 不可用按内存降级由 KV 层兜底）
      deps.logger.warn({ err, key }, 'rate limit incr failed');
      return next();
    }
    if (count > opts.limit) {
      const retryAfter = opts.windowSeconds - Math.floor((Date.now() / 1000) % opts.windowSeconds);
      c.header('Retry-After', String(Math.max(1, retryAfter)));
      throw new AppError('LB_RATE_LIMITED', 429, 'rate limited', { retryAfter });
    }
    await next();
  };
}
