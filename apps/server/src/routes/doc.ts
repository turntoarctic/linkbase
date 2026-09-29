import { Hono } from 'hono';
import type { AppDeps, AppState } from '../types';
import { requireAuth, requireMember } from '../middleware/auth';
import * as docsService from '../services/docs';

/**
 * 10 §5.2 Y.Doc 增量（二进制，octet-stream）。
 * 大小限制：pull 的 state 参数走 query；push ≤512KB（docs service 校验），
 * Bun.serve.maxRequestBodySize 30MB 兜底（07 §3）。
 */
export function docRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.use('/:wsId/pages/:pageId/doc', requireAuth(deps), requireMember(deps));

  // pull：?state={base64 state vector} → 差异 update 字节；空页 404（08 §4.1）
  app.get('/:wsId/pages/:pageId/doc', async (c) => {
    const pageId = c.req.param('pageId');
    const state = c.req.query('state');
    const diff = await docsService.pullDoc(deps, pageId, state || undefined);
    c.header('Content-Type', 'application/octet-stream');
    return c.body(Buffer.from(diff));
  });

  // push：body = update 字节 → 204（08 §4.2，写路径只落增量）
  app.post('/:wsId/pages/:pageId/doc', async (c) => {
    const userId = c.get('userId');
    const wsId = c.get('wsId');
    const pageId = c.req.param('pageId');
    const body = await c.req.arrayBuffer();
    await docsService.pushDoc(deps, userId, wsId, pageId, body);
    return c.body(null, 204);
  });

  return app;
}
