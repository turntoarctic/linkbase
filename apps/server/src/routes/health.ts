import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import type { AppDeps, AppState } from '../types';

/** 07 §9：探活（PG select 1 + Redis ping），供 healthcheck 与探活 */
export function healthRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.get('/health', async (c) => {
    let pg = false;
    let redis = false;
    try {
      await deps.db.execute(sql`select 1`);
      pg = true;
    } catch {
      pg = false;
    }
    try {
      redis = await deps.kv.ping();
    } catch {
      redis = false;
    }
    return c.json(
      {
        status: pg ? 'ok' : 'degraded',
        pg: pg ? 'ok' : 'fail',
        redis: redis ? 'ok' : 'fail',
        uptime: Math.round(process.uptime()),
      },
      200,
    );
  });

  return app;
}
