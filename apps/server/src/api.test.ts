/**
 * Phase 0 接口测试（07 §8）：app.request() 全链路，需真实 PG。
 * 门控：未设置 DATABASE_URL 时整组跳过（本地开发 `docker compose -f docker/compose.dev.yml up -d postgres`）。
 * 前置：已执行 `bun run db:migrate`。
 */
import { beforeAll, describe, expect, test } from 'bun:test';
import { createDb } from '@linkbase/database';
import { Y, encodeStateAsUpdate, encodeStateVector, toBase64, diffUpdate } from '@linkbase/ydoc';
import { createApp } from './app';
import { createMemoryKV } from './db/redis';
import { createLogger } from './lib/logger';
import { loadEnv } from './env';
import type { AppDeps } from './types';

const DATABASE_URL = process.env.DATABASE_URL ?? '';
const HAS_DB = DATABASE_URL.length > 0;

interface Ctx {
  deps: AppDeps;
  accessToken: string;
  refreshToken: string;
  wsId: string;
  quickStartPageId: string;
}

describe.skipIf(!HAS_DB)('Phase 0 API 全链路（T0.5/T0.6/T0.7）', () => {
  let ctx: Ctx;

  beforeAll(async () => {
    const env = loadEnv({
      DATABASE_URL,
      JWT_SECRET: 'test-secret-test-secret-1234',
      RATE_LIMIT_ENABLED: '0',
      LOG_LEVEL: 'error',
    });
    const { db } = createDb(DATABASE_URL);
    const logger = createLogger('error');
    ctx = {
      deps: { env, db, kv: createMemoryKV(), logger },
      accessToken: '',
      refreshToken: '',
      wsId: '',
      quickStartPageId: '',
    };
    // 清理本轮测试前缀数据（测试自隔离：使用唯一邮箱）
  });

  const email = `t0-${Date.now()}-${Math.floor(Math.random() * 1e6)}@linkbase.test`;
  const password = 'password-123';

  test('T0.7 注册：201 + 自动建空间 + 快速开始页（零仪式）', async () => {
    const app = createApp(ctx.deps);
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: '测试用户' }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      user: { id: string; email: string; locale: string | null };
      accessToken: string;
      refreshToken: string;
      workspace: { id: string; name: string };
    };
    expect(body.user.email).toBe(email);
    expect(body.user.locale).toBeNull();
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    ctx.accessToken = body.accessToken;
    ctx.refreshToken = body.refreshToken;
    ctx.wsId = body.workspace.id;

    // 快速开始页已存在
    const pagesRes = await app.request(`/api/workspaces/${ctx.wsId}/pages`, {
      headers: { Authorization: `Bearer ${ctx.accessToken}` },
    });
    expect(pagesRes.status).toBe(200);
    const pages = (await pagesRes.json()) as { id: string; title: string; children: unknown[] }[];
    expect(pages.length).toBe(1);
    expect(pages[0]!.title).toBe('快速开始');
    ctx.quickStartPageId = pages[0]!.id;
  });

  test('重复注册 → 409 LB_EMAIL_TAKEN', async () => {
    const app = createApp(ctx.deps);
    const res = await app.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name: '重复' }),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('LB_EMAIL_TAKEN');
  });

  test('登录 + me：200', async () => {
    const app = createApp(ctx.deps);
    const login = await app.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { accessToken: string; refreshToken: string };
    expect(loginBody.accessToken).toBeTruthy();

    const me = await app.request('/api/auth/me', {
      headers: { Authorization: `Bearer ${loginBody.accessToken}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { workspaces: { id: string; role: string }[] };
    expect(meBody.workspaces.length).toBe(1);
    expect(meBody.workspaces[0]!.role).toBe('owner');
  });

  test('T0.6 页面 CRUD + 树 + 回收站', async () => {
    const app = createApp(ctx.deps);
    const auth = { Authorization: `Bearer ${ctx.accessToken}` };

    // 建子页
    const create = await app.request(`/api/workspaces/${ctx.wsId}/pages`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ title: '子页', parentId: ctx.quickStartPageId }),
    });
    expect(create.status).toBe(201);
    const child = (await create.json()) as { id: string; parentId: string | null };
    expect(child.parentId).toBe(ctx.quickStartPageId);

    // 树
    const tree = await app.request(`/api/workspaces/${ctx.wsId}/pages`, { headers: auth });
    const treeBody = (await tree.json()) as { id: string; children: { id: string }[] }[];
    expect(treeBody[0]!.children.some((n) => n.id === child.id)).toBe(true);

    // 移入回收站
    const trash = await app.request(`/api/workspaces/${ctx.wsId}/pages/${child.id}`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(trash.status).toBe(204);
    const trashList = await app.request(`/api/workspaces/${ctx.wsId}/trash`, { headers: auth });
    const trashBody = (await trashList.json()) as { page: { id: string }; path: unknown[] }[];
    expect(trashBody.some((t) => t.page.id === child.id)).toBe(true);

    // 恢复
    const restore = await app.request(`/api/workspaces/${ctx.wsId}/pages/${child.id}/restore`, {
      method: 'POST',
      headers: auth,
    });
    expect(restore.status).toBe(204);

    // 彻底删除
    const purge = await app.request(`/api/workspaces/${ctx.wsId}/pages/${child.id}?permanent=true`, {
      method: 'DELETE',
      headers: auth,
    });
    expect(purge.status).toBe(204);
  });

  test('T0.5 doc 通路：空页 404 → push → pull 差分', async () => {
    const app = createApp(ctx.deps);
    const auth = { Authorization: `Bearer ${ctx.accessToken}` };

    // 空页（无快照无 updates）→ 404 LB_PAGE_NOT_FOUND
    const empty = await app.request(
      `/api/workspaces/${ctx.wsId}/pages/${ctx.quickStartPageId}/doc`,
      { headers: auth },
    );
    expect(empty.status).toBe(404);
    const emptyBody = (await empty.json()) as { error: { code: string } };
    expect(emptyBody.error.code).toBe('LB_PAGE_NOT_FOUND');

    // 构造两轮 yjs 更新（模拟客户端第一轮已同步、第二轮待拉取）
    const doc = new Y.Doc();
    doc.getMap('blocks').set('a', new Y.Map());
    const sv1 = encodeStateVector(doc);
    const state1 = encodeStateAsUpdate(doc);
    doc.getMap('blocks').set('b', new Y.Map());
    const state2 = encodeStateAsUpdate(doc);

    // push（POST 二进制 update，模拟客户端推增量：state2 相对 state1 的差分）
    const delta = diffUpdate(state2, sv1);
    const push = await app.request(
      `/api/workspaces/${ctx.wsId}/pages/${ctx.quickStartPageId}/doc`,
      { method: 'POST', headers: auth, body: delta.buffer.slice(delta.byteOffset, delta.byteOffset + delta.byteLength) as ArrayBuffer },
    );
    expect(push.status).toBe(204);

    // pull（带第一轮 state vector → 应取回差分）
    const pull = await app.request(
      `/api/workspaces/${ctx.wsId}/pages/${ctx.quickStartPageId}/doc?state=${encodeURIComponent(toBase64(sv1))}`,
      { headers: auth },
    );
    expect(pull.status).toBe(200);
    const diffBytes = new Uint8Array(await pull.arrayBuffer());
    expect(diffBytes.byteLength).toBeGreaterThan(0);

    // 客户端应用差分后与服务器状态一致
    const client = new Y.Doc();
    Y.applyUpdate(client, state1);
    Y.applyUpdate(client, diffBytes);
    expect(client.getMap('blocks').size).toBe(2);

    // 超限 update → 413
    const tooBig = new ArrayBuffer(512 * 1024 + 1);
    const oversize = await app.request(
      `/api/workspaces/${ctx.wsId}/pages/${ctx.quickStartPageId}/doc`,
      { method: 'POST', headers: auth, body: tooBig },
    );
    expect(oversize.status).toBe(413);
  });

  test('T0.5 派生缓存：push 后 title 异步对齐（08 §5）', async () => {
    const app = createApp(ctx.deps);
    const auth = { Authorization: `Bearer ${ctx.accessToken}` };

    // 建新页并推送带标题的 doc 状态
    const create = await app.request(`/api/workspaces/${ctx.wsId}/pages`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ title: '' }),
    });
    const page = (await create.json()) as { id: string };

    const doc = new Y.Doc();
    const blocks = doc.getMap('blocks');
    const pageBlock = blocks.set('root', new Y.Map()) as Y.Map<unknown>;
    pageBlock.set('sys:id', 'root');
    pageBlock.set('sys:flavour', 'affine:page');
    pageBlock.set('prop:title', new Y.Text('提取的标题'));
    await app.request(`/api/workspaces/${ctx.wsId}/pages/${page.id}/doc`, {
      method: 'POST',
      headers: auth,
      body: encodeStateAsUpdate(doc).buffer.slice(0) as ArrayBuffer,
    });

    // 异步对齐轮询（08 §4.2：不阻塞写路径）
    let title = '';
    for (let i = 0; i < 40 && !title; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const meta = await app.request(`/api/workspaces/${ctx.wsId}/pages/${page.id}`, { headers: auth });
      const body = (await meta.json()) as { title: string };
      title = body.title;
    }
    expect(title).toBe('提取的标题');
  });

  test('鉴权与成员校验：401/403', async () => {
    const app = createApp(ctx.deps);
    const noAuth = await app.request(`/api/workspaces/${ctx.wsId}/pages`);
    expect(noAuth.status).toBe(401);
    const body401 = (await noAuth.json()) as { error: { code: string } };
    expect(body401.error.code).toBe('LB_UNAUTHORIZED');

    // 非成员访问他人空间
    const reg = await app.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email: `intruder-${Date.now()}@linkbase.test`,
        password,
        name: '路人',
      }),
    });
    const intruder = (await reg.json()) as { accessToken: string };
    const forbidden = await app.request(`/api/workspaces/${ctx.wsId}/pages`, {
      headers: { Authorization: `Bearer ${intruder.accessToken}` },
    });
    expect(forbidden.status).toBe(403);
    const body403 = (await forbidden.json()) as { error: { code: string } };
    expect(body403.error.code).toBe('LB_FORBIDDEN');
  });

  test('refresh 旋转 + logout', async () => {
    const app = createApp(ctx.deps);
    const oldToken = ctx.refreshToken;
    const r1 = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: oldToken }),
    });
    expect(r1.status).toBe(200);
    const pair = (await r1.json()) as { refreshToken: string };
    ctx.refreshToken = pair.refreshToken;

    // 旧 token 已旋转：再刷 → 401 LB_TOKEN_INVALID（07 §5）
    const stale = await app.request('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: oldToken }),
    });
    expect(stale.status).toBe(401);
    const staleBody = (await stale.json()) as { error: { code: string } };
    expect(staleBody.error.code).toBe('LB_TOKEN_INVALID');

    const out = await app.request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: ctx.refreshToken }),
    });
    expect(out.status).toBe(204);
  });

  test('health：pg ok', async () => {
    const app = createApp(ctx.deps);
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { pg: string; redis: string };
    expect(body.pg).toBe('ok');
    expect(body.redis).toBe('ok'); // memory KV ping
  });

  test('tags：新建重名 409 + 打标', async () => {
    const app = createApp(ctx.deps);
    const auth = { Authorization: `Bearer ${ctx.accessToken}` };
    const create = await app.request(`/api/workspaces/${ctx.wsId}/tags`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'P0', color: 3 }),
    });
    expect(create.status).toBe(201);
    const tag = (await create.json()) as { id: string };

    const dup = await app.request(`/api/workspaces/${ctx.wsId}/tags`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ name: 'P0' }),
    });
    expect(dup.status).toBe(409);

    const put = await app.request(
      `/api/workspaces/${ctx.wsId}/pages/${ctx.quickStartPageId}/tags/${tag.id}`,
      { method: 'PUT', headers: auth },
    );
    expect(put.status).toBe(204);
    const list = await app.request(
      `/api/workspaces/${ctx.wsId}/pages/${ctx.quickStartPageId}/tags`,
      { headers: auth },
    );
    const tags = (await list.json()) as { name: string }[];
    expect(tags.some((t) => t.name === 'P0')).toBe(true);
  });

  test('search：标题可被检索（08 §6）', async () => {
    const app = createApp(ctx.deps);
    const auth = { Authorization: `Bearer ${ctx.accessToken}` };
    // 快速开始页 title 已有；搜"快速"
    const res = await app.request(
      `/api/workspaces/${ctx.wsId}/search?q=${encodeURIComponent('快速')}`,
      { headers: auth },
    );
    expect(res.status).toBe(200);
    const items = (await res.json()) as { id: string; title: string; breadcrumb: unknown[] }[];
    expect(items.some((i) => i.id === ctx.quickStartPageId)).toBe(true);
  });
});
