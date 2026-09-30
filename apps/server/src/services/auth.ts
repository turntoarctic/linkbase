import { toUserRow } from '../lib/serialize';
import { AppError, unauthorized } from '../lib/errors';
import { errorCodes } from '@linkbase/contracts';
import { eq } from 'drizzle-orm';
import type { AppDeps } from '../types';
import { users } from '@linkbase/database';
import {
  issueSession,
  rotateRefreshToken,
  revokeRefreshToken,
  type TokenPair,
} from '../lib/tokens';
import { workspaces, workspaceMembers, pages } from '@linkbase/database';
import type { LoginInput, RegisterInput } from '@linkbase/contracts';

async function findUserByEmail(deps: AppDeps, email: string) {
  const rows = await deps.db.select().from(users).where(eq(users.email, email)).limit(1);
  return rows[0] ?? null;
}

/** 注册：自动建空间 + 快速开始页，直接返回两 token（10 §2 / 02 §1.1） */
export async function register(
  deps: AppDeps,
  input: RegisterInput,
): Promise<{ user: ReturnType<typeof toUserRow>; workspace: { id: string; name: string } } & TokenPair> {
  const existing = await findUserByEmail(deps, input.email);
  if (existing) {
    throw new AppError(errorCodes.EMAIL_TAKEN, 409, 'email already registered');
  }
  const passwordHash = await Bun.password.hash(input.password, { algorithm: 'argon2id' });
  const userId = Bun.randomUUIDv7();
  const workspaceId = Bun.randomUUIDv7();
  const workspaceName = `${input.name} 的空间`;

  await deps.db.transaction(async (tx) => {
    await tx.insert(users).values({
      id: userId,
      email: input.email,
      passwordHash,
      name: input.name,
    });
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: workspaceName,
      createdBy: userId,
    });
    await tx.insert(workspaceMembers).values({
      workspaceId,
      userId,
      role: 'owner',
    });
    // 快速开始页：无内容（GET /doc 404），编辑器空文档起（05 §2）
    await tx.insert(pages).values({
      id: Bun.randomUUIDv7(),
      workspaceId,
      title: '快速开始',
      createdBy: userId,
    });
  });

  const created = await findUserByEmail(deps, input.email);
  if (!created) throw new AppError(errorCodes.INTERNAL, 500, 'user creation failed');
  const tokens = await issueSession(deps, userId, workspaceId);
  return {
    user: toUserRow(created),
    workspace: { id: workspaceId, name: workspaceName },
    ...tokens,
  };
}

export async function login(
  deps: AppDeps,
  input: LoginInput,
): Promise<{ user: ReturnType<typeof toUserRow> } & TokenPair> {
  const user = await findUserByEmail(deps, input.email);
  if (!user || user.deletedAt) throw unauthorized('invalid email or password');
  const ok = await Bun.password.verify(input.password, user.passwordHash);
  if (!ok) throw unauthorized('invalid email or password');
  const tokens = await issueSession(deps, user.id);
  return { user: toUserRow(user), ...tokens };
}

export async function refresh(deps: AppDeps, refreshToken: string): Promise<TokenPair> {
  const pair = await rotateRefreshToken(deps, refreshToken);
  if (!pair) throw new AppError(errorCodes.TOKEN_INVALID, 401, 'refresh token invalid or rotated');
  return pair;
}

export async function logout(deps: AppDeps, refreshToken: string): Promise<void> {
  await revokeRefreshToken(deps, refreshToken);
}

/** GET /auth/me：用户 + 我的空间（含角色） */
export async function me(deps: AppDeps, userId: string) {
  const rows = await deps.db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user || user.deletedAt) throw unauthorized();
  const spaces = await deps.db
    .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));
  return {
    user: toUserRow(user),
    workspaces: spaces.map((s) => ({ id: s.id, name: s.name, role: s.role })),
  };
}
