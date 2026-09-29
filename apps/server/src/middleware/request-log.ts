import type { Context, Next } from 'hono';
import type { AppDeps } from '../types';

/** 结构化请求日志 + X-Request-Id 回传（07 §3/§9） */
export function requestLogger(deps: AppDeps) {
  return async (c: Context, next: Next) => {
    const reqId = crypto.randomUUID();
    c.set('reqId', reqId);
    const start = performance.now();
    await next();
    const ms = Math.round(performance.now() - start);
    c.header('X-Request-Id', reqId);
    deps.logger.info(
      {
        reqId,
        method: c.req.method,
        path: c.req.path,
        status: c.res?.status,
        ms,
      },
      'request',
    );
  };
}
