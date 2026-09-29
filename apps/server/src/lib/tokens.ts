import { sign, verify } from 'hono/jwt';
import type { AppDeps } from '../types';

const ACCESS_TTL_SECONDS = 15 * 60; // 07 §5
export const REFRESH_TTL_SECONDS = 7 * 24 * 3600;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/** HS256 JWT，payload { sub, wid? }（07 §5） */
export async function signAccessToken(
  deps: AppDeps,
  userId: string,
  workspaceId?: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return await sign(
    { sub: userId, ...(workspaceId ? { wid: workspaceId } : {}), exp: now + ACCESS_TTL_SECONDS },
    deps.env.JWT_SECRET,
    'HS256',
  );
}

export async function verifyAccessToken(deps: AppDeps, token: string): Promise<string | null> {
  try {
    const payload = await verify(token, deps.env.JWT_SECRET, 'HS256');
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function newRefreshToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

/** 签发会话：access JWT + 不透明 refresh（Redis `refresh:{token}`，07 §5） */
export async function issueSession(
  deps: AppDeps,
  userId: string,
  workspaceId?: string,
): Promise<TokenPair> {
  const accessToken = await signAccessToken(deps, userId, workspaceId);
  const refreshToken = newRefreshToken();
  await deps.kv.set(
    `refresh:${refreshToken}`,
    JSON.stringify({ userId }),
    REFRESH_TTL_SECONDS,
  );
  return { accessToken, refreshToken };
}

/** Refresh 旋转：旧 token 立即失效（07 §5）；返回 userId 或 null */
export async function rotateRefreshToken(
  deps: AppDeps,
  refreshToken: string,
): Promise<TokenPair | null> {
  const raw = await deps.kv.get(`refresh:${refreshToken}`);
  if (!raw) return null;
  let userId: string | undefined;
  try {
    userId = (JSON.parse(raw) as { userId?: string }).userId;
  } catch {
    return null;
  }
  if (!userId) return null;
  // 先删后发：即使后续签发失败，旧 token 也已作废（安全优先）
  await deps.kv.del(`refresh:${refreshToken}`);
  const pair = await issueSession(deps, userId);
  return pair;
}

export async function revokeRefreshToken(deps: AppDeps, refreshToken: string): Promise<void> {
  await deps.kv.del(`refresh:${refreshToken}`);
}
