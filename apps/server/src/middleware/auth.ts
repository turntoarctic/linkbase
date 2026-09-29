import { and, eq } from 'drizzle-orm';
import { workspaceMembers } from '@linkbase/database';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken } from '../lib/tokens';
import type { AppDeps } from '../types';
import type { Context, Next } from 'hono';

/** JWT 鉴权 → c.set('userId')（07 §3/§5） */
export function requireAuth(deps: AppDeps) {
  return async (c: Context, next: Next) => {
    const header = c.req.header('Authorization');
    if (!header?.startsWith('Bearer ')) throw unauthorized('missing bearer token');
    const userId = await verifyAccessToken(deps, header.slice(7));
    if (!userId) throw unauthorized('invalid or expired token');
    c.set('userId', userId);
    await next();
  };
}

/** 工作空间成员校验（03 §3，不缓存）→ c.set('wsId'/'wsRole') */
export function requireMember(deps: AppDeps) {
  return async (c: Context, next: Next) => {
    const userId = c.get('userId');
    const wsId = c.req.param('wsId');
    if (!wsId) throw forbidden('missing workspace id');
    const rows = await deps.db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, userId)))
      .limit(1);
    const role = rows[0]?.role as 'owner' | 'admin' | 'member' | undefined;
    if (!role) throw forbidden('not a workspace member');
    c.set('wsId', wsId);
    c.set('wsRole', role);
    await next();
  };
}
