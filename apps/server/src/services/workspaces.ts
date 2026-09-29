import { and, eq, sql } from 'drizzle-orm';
import {
  users,
  workspaces,
  workspaceMembers,
  pages,
} from '@linkbase/database';
import { forbidden, notFound } from '../lib/errors';
import type { AppDeps, AppState } from '../types';
import type { Hono } from 'hono';

export type HonoApp = Hono<AppState>;

/** 成员校验（03 §3）：owner > admin > member */
export function atLeast(role: 'owner' | 'admin' | 'member') {
  const rank = { owner: 3, admin: 2, member: 1 } as const;
  return (current: string) => rank[current as keyof typeof rank] >= rank[role];
}

export function requireRole(min: 'owner' | 'admin' | 'member') {
  return (c: { get: (k: 'wsRole') => string }) => {
    if (!atLeast(min)(c.get('wsRole'))) throw forbidden(`requires ${min} role`);
  };
}

export async function createWorkspace(deps: AppDeps, userId: string, name: string) {
  const id = Bun.randomUUIDv7();
  await deps.db.transaction(async (tx) => {
    await tx.insert(workspaces).values({ id, name, createdBy: userId });
    await tx.insert(workspaceMembers).values({ workspaceId: id, userId, role: 'owner' });
  });
  const rows = await deps.db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  const ws = rows[0];
  if (!ws) throw notFound('workspace not found after creation');
  return { id: ws.id, name: ws.name, avatarUrl: ws.avatarUrl ?? null, role: 'owner' as const, memberCount: 1, createdAt: ws.createdAt.toISOString() };
}

export async function listMyWorkspaces(deps: AppDeps, userId: string) {
  const rows = await deps.db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      avatarUrl: workspaces.avatarUrl,
      role: workspaceMembers.role,
      createdAt: workspaces.createdAt,
      memberCount: sql<number>`(select count(*)::int from workspace_members m where m.workspace_id = ${workspaces.id})`,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    avatarUrl: r.avatarUrl ?? null,
    role: r.role as 'owner' | 'admin' | 'member',
    memberCount: r.memberCount,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function getWorkspaceDetail(deps: AppDeps, wsId: string) {
  const rows = await deps.db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      avatarUrl: workspaces.avatarUrl,
      createdAt: workspaces.createdAt,
      memberCount: sql<number>`(select count(*)::int from workspace_members m where m.workspace_id = ${workspaces.id})`,
    })
    .from(workspaces)
    .where(eq(workspaces.id, wsId))
    .limit(1);
  const ws = rows[0];
  if (!ws) throw notFound('workspace not found');
  return {
    id: ws.id,
    name: ws.name,
    avatarUrl: ws.avatarUrl ?? null,
    memberCount: ws.memberCount,
    createdAt: ws.createdAt.toISOString(),
  };
}

export async function patchWorkspace(
  deps: AppDeps,
  wsId: string,
  input: { name?: string; avatarUrl?: string | null },
) {
  const rows = await deps.db
    .update(workspaces)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
    })
    .where(eq(workspaces.id, wsId))
    .returning();
  const ws = rows[0];
  if (!ws) throw notFound('workspace not found');
  return { id: ws.id, name: ws.name, avatarUrl: ws.avatarUrl ?? null };
}

export async function listMembers(deps: AppDeps, wsId: string) {
  const rows = await deps.db
    .select({
      userId: users.id,
      email: users.email,
      name: users.name,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, wsId));
  return rows.map((r) => ({
    userId: r.userId,
    email: r.email,
    name: r.name,
    role: r.role as 'owner' | 'admin' | 'member',
    joinedAt: r.joinedAt.toISOString(),
  }));
}

// ---- 邀请（Redis `invite:{token}`，08 §3.5）----

function inviteExpiry() {
  return { ttl: 7 * 24 * 3600, expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000) };
}

export async function createInvite(
  deps: AppDeps,
  wsId: string,
  inviterId: string,
  email?: string,
) {
  const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
  const { ttl, expiresAt } = inviteExpiry();
  await deps.kv.set(
    `invite:${token}`,
    JSON.stringify({ workspaceId: wsId, inviterId, email: email ?? null }),
    ttl,
  );
  return { inviteUrl: `${deps.env.FRONTEND_URL}/invite/${token}`, expiresAt: expiresAt.toISOString() };
}

interface InvitePayload {
  workspaceId: string;
  inviterId: string;
  email: string | null;
}

async function readInvite(deps: AppDeps, token: string): Promise<InvitePayload | null> {
  const raw = await deps.kv.get(`invite:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as InvitePayload;
  } catch {
    return null;
  }
}

/** GET /invites/:token（公开：给未登录的受邀者看空间名/邀请人） */
export async function getInviteInfo(deps: AppDeps, token: string) {
  const invite = await readInvite(deps, token);
  if (!invite) throw notFound('invite not found or expired');
  const wsRows = await deps.db
    .select({ name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, invite.workspaceId))
    .limit(1);
  const inviterRows = await deps.db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, invite.inviterId))
    .limit(1);
  if (!wsRows[0] || !inviterRows[0]) throw notFound('invite target missing');
  return { workspaceName: wsRows[0].name, inviterName: inviterRows[0].name, expiresAt: '' };
}

/** POST /invites/:token/accept：登录后加入空间（member）；填了 email 则校验受邀人 */
export async function acceptInvite(deps: AppDeps, userId: string, token: string) {
  const invite = await readInvite(deps, token);
  if (!invite) throw notFound('invite not found or expired');
  if (invite.email) {
    const rows = await deps.db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (rows[0]?.email !== invite.email) throw forbidden('invite is for another email');
  }
  await deps.db
    .insert(workspaceMembers)
    .values({ workspaceId: invite.workspaceId, userId, role: 'member' })
    .onConflictDoNothing();
  await deps.kv.del(`invite:${token}`);
}

export async function patchMemberRole(
  deps: AppDeps,
  wsId: string,
  targetUserId: string,
  role: 'admin' | 'member',
) {
  // 不可作用于 owner（10 §3）
  const target = await deps.db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, targetUserId)))
    .limit(1);
  if (!target[0]) throw notFound('member not found');
  if (target[0].role === 'owner') throw forbidden('cannot change owner role; transfer first');
  await deps.db
    .update(workspaceMembers)
    .set({ role })
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, targetUserId)));
}

export async function removeMember(deps: AppDeps, wsId: string, targetUserId: string) {
  const target = await deps.db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, targetUserId)))
    .limit(1);
  if (!target[0]) throw notFound('member not found');
  if (target[0].role === 'owner') throw forbidden('cannot remove owner');
  await deps.db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, targetUserId)));
}

/** owner 转让：事务内对调角色（10 §3） */
export async function transferOwnership(deps: AppDeps, wsId: string, fromUserId: string, toUserId: string) {
  if (fromUserId === toUserId) throw forbidden('cannot transfer to self');
  await deps.db.transaction(async (tx) => {
    await tx
      .update(workspaceMembers)
      .set({ role: 'admin' })
      .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, fromUserId)));
    await tx
      .update(workspaceMembers)
      .set({ role: 'owner' })
      .where(and(eq(workspaceMembers.workspaceId, wsId), eq(workspaceMembers.userId, toUserId)));
  });
}
