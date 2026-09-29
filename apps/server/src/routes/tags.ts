import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { createTagSchema, patchTagSchema } from '@linkbase/contracts';
import type { AppDeps, AppState } from '../types';
import { requireAuth, requireMember } from '../middleware/auth';
import * as tagsService from '../services/tags';

const jsonOrThrow = <S extends ZodType>(schema: S) =>
  zValidator('json', schema, (result) => {
    if (!result.success) throw result.error;
  });

/** 10 §7 标签 */
export function tagRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.use('/:wsId', requireAuth(deps), requireMember(deps));
  app.use('/:wsId/*', requireAuth(deps), requireMember(deps));

  app.get('/:wsId/tags', async (c) => {
    return c.json(await tagsService.listTags(deps, c.get('wsId')), 200);
  });

  app.post('/:wsId/tags', jsonOrThrow(createTagSchema), async (c) => {
    const body = c.req.valid('json');
    return c.json(await tagsService.createTag(deps, c.get('wsId'), body), 201);
  });

  app.patch('/:wsId/tags/:tagId', jsonOrThrow(patchTagSchema), async (c) => {
    const body = c.req.valid('json');
    return c.json(await tagsService.patchTag(deps, c.get('wsId'), c.req.param('tagId'), body), 200);
  });

  app.delete('/:wsId/tags/:tagId', async (c) => {
    await tagsService.deleteTag(deps, c.get('wsId'), c.req.param('tagId'));
    return c.body(null, 204);
  });

  app.get('/:wsId/pages/:pageId/tags', async (c) => {
    return c.json(await tagsService.pageTagList(deps, c.req.param('pageId')), 200);
  });

  // 标签聚合视图（T1.5，P0-7）：标签 → 打标页面（非回收站）
  app.get('/:wsId/tags/:tagId/pages', async (c) => {
    return c.json(
      await tagsService.tagPages(deps, c.get('wsId'), c.req.param('tagId')),
      200,
    );
  });

  app.put('/:wsId/pages/:pageId/tags/:tagId', async (c) => {
    await tagsService.tagPage(deps, c.get('wsId'), c.req.param('pageId'), c.req.param('tagId'));
    return c.body(null, 204);
  });

  app.delete('/:wsId/pages/:pageId/tags/:tagId', async (c) => {
    await tagsService.untagPage(deps, c.req.param('pageId'), c.req.param('tagId'));
    return c.body(null, 204);
  });

  return app;
}
