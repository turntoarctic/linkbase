import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { searchQuerySchema } from '@linkbase/contracts';
import type { AppDeps, AppState } from '../types';
import { requireAuth, requireMember } from '../middleware/auth';
import * as searchService from '../services/search';

/** 10 §7 搜索（08 §6：tsvector + trigram） */
export function searchRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.get(
    '/:wsId/search',
    requireAuth(deps),
    requireMember(deps),
    zValidator('query', searchQuerySchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const { q } = c.req.valid('query');
      return c.json(await searchService.search(deps, c.get('wsId'), q), 200);
    },
  );

  return app;
}
