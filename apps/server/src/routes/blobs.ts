import { Hono } from 'hono';
import type { AppDeps, AppState } from '../types';
import { requireAuth, requireMember } from '../middleware/auth';
import { notFound } from '../lib/errors';
import * as blobsService from '../services/blobs';

/** 10 §5.3 Blob 附件（multipart ≤25MB；内容寻址 id 长缓存） */
export function blobRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.post('/workspaces/:wsId/blobs', requireAuth(deps), requireMember(deps), async (c) => {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) {
      return c.json(
        { error: { code: 'LB_VALIDATION', message: 'multipart field "file" is required', details: null } },
        400,
      );
    }
    const out = await blobsService.putBlob(deps, c.get('userId'), c.get('wsId'), file);
    return c.json(out, 201);
  });

  // GET 免鉴权：id 为 sha256 前 32 hex（128-bit 不可猜），<img> 无法带 Bearer 头；
  // 代价 = 凭 URL 可读单张图（类似 Notion/Drive 公链语义，10 §5.3）；写删仍鉴权
  app.get('/blobs/:id', async (c) => {
    const blob = await blobsService.getBlob(deps, c.req.param('id')!);
    if (!blob) throw notFound('blob not found');
    c.header('Content-Type', blob.mime);
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
    return c.body(Buffer.from(blob.data));
  });

  app.delete('/blobs/:id', requireAuth(deps), async (c) => {
    const ok = await blobsService.deleteBlob(deps, c.req.param('id')!);
    if (!ok) throw notFound('blob not found');
    return c.body(null, 204);
  });

  return app;
}
