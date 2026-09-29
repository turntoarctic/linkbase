import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { createPageSchema, patchPageSchema } from '@linkbase/contracts';
import type { AppDeps, AppState } from '../types';
import { requireAuth, requireMember } from '../middleware/auth';
import * as pagesService from '../services/pages';

const jsonOrThrow = <S extends ZodType>(schema: S) =>
  zValidator('json', schema, (result) => {
    if (!result.success) throw result.error;
  });

/** 10 §4 页面（全部挂在工作空间下）+ 回收站 + 收藏 + 最近访问 */
export function pageRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.use('/:wsId', requireAuth(deps), requireMember(deps));
  app.use('/:wsId/*', requireAuth(deps), requireMember(deps));

  app.get('/:wsId/pages', async (c) => {
    return c.json(await pagesService.listTree(deps, c.get('wsId')), 200);
  });

  app.post(
    '/:wsId/pages',
    jsonOrThrow(createPageSchema),
    async (c) => {
      const userId = c.get('userId');
      const wsId = c.get('wsId');
      const body = c.req.valid('json');
      return c.json(await pagesService.createPage(deps, userId, wsId, body), 201);
    },
  );

  app.get('/:wsId/pages/:pageId', async (c) => {
    return c.json(await pagesService.getPageMeta(deps, c.get('wsId'), c.req.param('pageId')), 200);
  });

  app.patch(
    '/:wsId/pages/:pageId',
    jsonOrThrow(patchPageSchema),
    async (c) => {
      const body = c.req.valid('json');
      return c.json(
        await pagesService.patchPage(deps, c.get('wsId'), c.req.param('pageId'), body),
        200,
      );
    },
  );

  app.delete('/:wsId/pages/:pageId', async (c) => {
    const wsId = c.get('wsId');
    const pageId = c.req.param('pageId');
    if (c.req.query('permanent') === 'true') {
      await pagesService.purgePage(deps, wsId, pageId);
    } else {
      await pagesService.trashPage(deps, wsId, pageId);
    }
    return c.body(null, 204);
  });

  app.post('/:wsId/pages/:pageId/restore', async (c) => {
    await pagesService.restorePage(deps, c.get('wsId'), c.req.param('pageId'));
    return c.body(null, 204);
  });

  app.get('/:wsId/trash', async (c) => {
    return c.json(await pagesService.listTrash(deps, c.get('wsId')), 200);
  });

  app.put('/:wsId/pages/:pageId/favorite', async (c) => {
    await pagesService.setFavorite(deps, c.get('userId'), c.req.param('pageId'));
    return c.body(null, 204);
  });

  app.delete('/:wsId/pages/:pageId/favorite', async (c) => {
    await pagesService.unsetFavorite(deps, c.get('userId'), c.req.param('pageId'));
    return c.body(null, 204);
  });

  app.get('/:wsId/favorites', async (c) => {
    return c.json(await pagesService.listFavorites(deps, c.get('userId'), c.get('wsId')), 200);
  });

  app.put('/:wsId/pages/:pageId/visit', async (c) => {
    await pagesService.recordVisit(deps, c.get('userId'), c.req.param('pageId'));
    return c.body(null, 204);
  });

  app.get('/:wsId/recents', async (c) => {
    return c.json(await pagesService.listRecents(deps, c.get('userId'), c.get('wsId')), 200);
  });

  return app;
}
