import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { patchMeSchema } from '@linkbase/contracts';
import type { AppDeps, AppState } from '../types';
import { requireAuth } from '../middleware/auth';
import * as usersService from '../services/users';

/** 10 §2.1 用户资料 */
export function usersRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.patch(
    '/me',
    requireAuth(deps),
    zValidator('json', patchMeSchema, (result) => {
      if (!result.success) throw result.error;
    }),
    async (c) => {
      const userId = c.get('userId');
      const body = c.req.valid('json');
      return c.json(await usersService.patchMe(deps, userId, body), 200);
    },
  );

  return app;
}
