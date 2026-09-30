import { Hono } from 'hono';
import type { AppDeps, AppState } from '../types';
import { requireAuth, requireMember } from '../middleware/auth';
import { docContentSchema } from '@linkbase/contracts';
import { zValidator } from '@hono/zod-validator';
import * as docsService from '../services/docs';

/**
 * 10 §5.2 文档内容（BlockNote JSON，块数组）。
 * GET：无内容 404（LB_PAGE_NOT_FOUND）；PUT：整体覆盖，≤1MB（docs service 校验）。
 */
export function docRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.use('/:wsId/pages/:pageId/doc', requireAuth(deps), requireMember(deps));

  app.get('/:wsId/pages/:pageId/doc', async (c) => {
    const pageId = c.req.param('pageId');
    return c.json(await docsService.getDoc(deps, pageId));
  });

  app.put(
    '/:wsId/pages/:pageId/doc',
    zValidator('json', docContentSchema),
    async (c) => {
      const content = c.req.valid('json');
      // 紧凑序列化 ≤ 原始报文长度，作 1MB 粗守卫足够
      await docsService.putDoc(deps, c.get('wsId'), c.req.param('pageId')!, content, JSON.stringify(content).length);
      return c.body(null, 204);
    },
  );

  return app;
}
