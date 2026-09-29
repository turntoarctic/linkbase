import { join } from 'node:path';
import type { Context, Next } from 'hono';
import type { AppDeps } from '../types';

/** 仓库根（本文件位于 apps/server/src/middleware）：保证 WEB_DIST 解析与 cwd 无关 */
const REPO_ROOT = join(import.meta.dir, '../../../..');

/**
 * 单 app 托管前端静态产物（07 §1/§2）：GET 非 /api 请求 → dist 文件；未命中 → SPA fallback index.html。
 * 产物不存在（本地开发只有 API）时直接放行。
 */
export function staticHandler(deps: AppDeps) {
  const root = join(REPO_ROOT, deps.env.WEB_DIST);
  return async (c: Context, next: Next) => {
    if (c.req.method !== 'GET' || c.req.path.startsWith('/api')) return next();
    const rel = c.req.path === '/' ? 'index.html' : c.req.path.slice(1);
    // 防目录穿越
    if (rel.includes('..')) return next();
    const file = Bun.file(join(root, rel));
    if (await file.exists()) return new Response(file);
    const index = Bun.file(join(root, 'index.html'));
    if (await index.exists()) return new Response(index);
    return next();
  };
}
