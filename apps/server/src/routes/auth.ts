import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import { loginSchema, refreshSchema, registerSchema } from '@linkbase/contracts';
import type { AppDeps, AppState } from '../types';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rate-limit';
import * as authService from '../services/auth';

const jsonOrThrow = <S extends ZodType>(schema: S) =>
  zValidator('json', schema, (result) => {
    if (!result.success) throw result.error;
  });

/** 10 §2 认证端点。限流：register 3/h、login 5/min（07 §3） */
export function authRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.post(
    '/register',
    rateLimit(deps, { name: 'register', limit: 3, windowSeconds: 3600 }),
    jsonOrThrow(registerSchema),
    async (c) => {
      const body = c.req.valid('json');
      const out = await authService.register(deps, body);
      return c.json(out, 201);
    },
  );

  app.post(
    '/login',
    rateLimit(deps, { name: 'login', limit: 5, windowSeconds: 60 }),
    jsonOrThrow(loginSchema),
    async (c) => {
      const body = c.req.valid('json');
      const out = await authService.login(deps, body);
      return c.json(out, 200);
    },
  );

  app.post(
    '/refresh',
    jsonOrThrow(refreshSchema),
    async (c) => {
      const { refreshToken } = c.req.valid('json');
      const out = await authService.refresh(deps, refreshToken);
      return c.json(out, 200);
    },
  );

  app.post(
    '/logout',
    jsonOrThrow(refreshSchema),
    async (c) => {
      const { refreshToken } = c.req.valid('json');
      await authService.logout(deps, refreshToken);
      return c.body(null, 204);
    },
  );

  app.get('/me', requireAuth(deps), async (c) => {
    const userId = c.get('userId');
    return c.json(await authService.me(deps, userId), 200);
  });

  return app;
}
