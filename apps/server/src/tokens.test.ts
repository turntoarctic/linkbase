import { describe, expect, test } from 'bun:test';
import { createMemoryKV } from './db/redis';
import { issueSession, rotateRefreshToken, revokeRefreshToken, verifyAccessToken } from './lib/tokens';
import type { AppDeps } from './types';

function deps(): AppDeps {
  return {
    env: {
      DATABASE_URL: 'postgres://test',
      JWT_SECRET: 'test-secret-test-secret-1234',
      PORT: 3001,
      FRONTEND_URL: 'http://localhost:5173',
      WEB_DIST: 'apps/web/dist',
      rateLimitEnabled: false,
      LOG_LEVEL: 'error',
    },
    db: {} as AppDeps['db'],
    kv: createMemoryKV(),
    logger: { info() {}, warn() {}, error() {}, child() {} } as unknown as AppDeps['logger'],
  };
}

describe('tokens（07 §5）', () => {
  test('access token sign/verify roundtrip', async () => {
    const d = deps();
    const token = await issueSession(d, 'user-1', 'ws-1');
    expect(token.accessToken.split('.').length).toBe(3);
    expect(await verifyAccessToken(d, token.accessToken)).toBe('user-1');
  });

  test('expired/garbage token → null', async () => {
    const d = deps();
    expect(await verifyAccessToken(d, 'garbage.token.here')).toBeNull();
  });

  test('refresh rotates: old token becomes invalid immediately', async () => {
    const d = deps();
    const first = await issueSession(d, 'user-1');
    const second = await rotateRefreshToken(d, first.refreshToken);
    expect(second).not.toBeNull();
    // 旧 token 已被删除 → 再旋转返回 null（LB_TOKEN_INVALID 场景）
    const third = await rotateRefreshToken(d, first.refreshToken);
    expect(third).toBeNull();
  });

  test('revoke works', async () => {
    const d = deps();
    const pair = await issueSession(d, 'user-2');
    await revokeRefreshToken(d, pair.refreshToken);
    expect(await rotateRefreshToken(d, pair.refreshToken)).toBeNull();
  });
});

describe('memory KV 限流语义', () => {
  test('incr counts and reports beyond limit', async () => {
    const kv = createMemoryKV();
    for (let i = 1; i <= 3; i++) {
      expect(await kv.incr('rl:test:win', 60)).toBe(i);
    }
  });
});
