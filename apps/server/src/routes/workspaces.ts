import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';
import {
  createWorkspaceSchema,
  inviteSchema,
  patchMemberSchema,
  patchWorkspaceSchema,
  transferOwnerSchema,
} from '@linkbase/contracts';
import type { AppDeps, AppState } from '../types';
import { requireAuth, requireMember } from '../middleware/auth';
import { forbidden } from '../lib/errors';
import * as ws from '../services/workspaces';

const jsonOrThrow = <S extends ZodType>(schema: S) =>
  zValidator('json', schema, (result) => {
    if (!result.success) throw result.error;
  });

/** 10 §3 工作空间（成员/邀请/角色/转让）。工作空间级路由统一鉴权（07 §3） */
export function workspaceRoutes(deps: AppDeps) {
  const app = new Hono<AppState>();

  app.use('*', requireAuth(deps));

  app.post('/', jsonOrThrow(createWorkspaceSchema), async (c) => {
    const userId = c.get('userId');
    const { name } = c.req.valid('json');
    return c.json(await ws.createWorkspace(deps, userId, name), 201);
  });

  app.get('/', async (c) => {
    const userId = c.get('userId');
    return c.json(await ws.listMyWorkspaces(deps, userId), 200);
  });

  // ---- 以下均需成员身份 ----
  const scoped = new Hono<AppState>();
  scoped.use('/:wsId/*', requireMember(deps));
  scoped.use('/:wsId', requireMember(deps));

  scoped.get('/:wsId', async (c) => {
    return c.json(await ws.getWorkspaceDetail(deps, c.req.param('wsId')), 200);
  });

  scoped.patch(
    '/:wsId',
    async (c, next) => {
      // owner/admin 才能改（03 §3）
      const role = c.get('wsRole');
      if (role !== 'owner' && role !== 'admin') throw forbidden('requires owner or admin');
      await next();
    },
    jsonOrThrow(patchWorkspaceSchema),
    async (c) => {
      const body = c.req.valid('json');
      return c.json(await ws.patchWorkspace(deps, c.req.param('wsId'), body), 200);
    },
  );

  scoped.get('/:wsId/members', async (c) => {
    return c.json(await ws.listMembers(deps, c.req.param('wsId')), 200);
  });

  scoped.post(
    '/:wsId/invite',
    async (c, next) => {
      const role = c.get('wsRole');
      if (role !== 'owner' && role !== 'admin') throw forbidden('requires owner or admin');
      await next();
    },
    jsonOrThrow(inviteSchema),
    async (c) => {
      const userId = c.get('userId');
      const { email } = c.req.valid('json');
      return c.json(await ws.createInvite(deps, c.req.param('wsId'), userId, email), 201);
    },
  );

  scoped.patch('/:wsId/members/:userId', jsonOrThrow(patchMemberSchema), async (c) => {
    const role = c.get('wsRole');
    if (role !== 'owner' && role !== 'admin') throw forbidden('requires owner or admin');
    const wsId = c.req.param('wsId');
    const target = c.req.param('userId');
    const { role: newRole } = c.req.valid('json');
    await ws.patchMemberRole(deps, wsId, target, newRole);
    return c.body(null, 204);
  });

  scoped.delete('/:wsId/members/:userId', async (c) => {
    const role = c.get('wsRole');
    if (role !== 'owner' && role !== 'admin') throw forbidden('requires owner or admin');
    await ws.removeMember(deps, c.req.param('wsId'), c.req.param('userId'));
    return c.body(null, 204);
  });

  scoped.post('/:wsId/transfer', jsonOrThrow(transferOwnerSchema), async (c) => {
    const role = c.get('wsRole');
    if (role !== 'owner') throw forbidden('requires owner');
    const userId = c.get('userId');
    const { toUserId } = c.req.valid('json');
    await ws.transferOwnership(deps, c.req.param('wsId')!, userId, toUserId);
    return c.body(null, 204);
  });

  app.route('/', scoped);

  // ---- 邀请公开端点（10 §3：GET 无需登录；accept 需登录）----
  app.get('/invites/:token', async (c) => {
    return c.json(await ws.getInviteInfo(deps, c.req.param('token')), 200);
  });

  app.post('/invites/:token/accept', requireAuth(deps), async (c) => {
    const userId = c.get('userId');
    await ws.acceptInvite(deps, userId, c.req.param('token')!);
    return c.body(null, 204);
  });

  return app;
}
