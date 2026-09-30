/**
 * 文档内容通路（08 §4 / 10 §5.2）。
 * 真相 = pages.content JSONB（BlockNote 块数组，05 §2）；GET 空 → 404；PUT 整体覆盖 + 异步提取 text 供搜索。
 */
import { eq } from 'drizzle-orm';
import { pages } from '@linkbase/database';
import type { DocContent } from '@linkbase/contracts';
import { pageNotFound, AppError } from '../lib/errors';
import { deriveMeta, SEARCH_TEXT_LIMIT } from '../lib/editor-meta';
import type { AppDeps } from '../types';

const MAX_DOC_BYTES = 1024 * 1024; // 10 §1：文档 JSON ≤1MB（Bun.serve 30MB 兜底）

export async function getDoc(deps: AppDeps, pageId: string): Promise<DocContent> {
  const rows = await deps.db
    .select({ content: pages.content })
    .from(pages)
    .where(eq(pages.id, pageId))
    .limit(1);
  const content = rows[0]?.content as DocContent | null;
  if (!content || content.length === 0) throw pageNotFound();
  return content;
}

export async function putDoc(
  deps: AppDeps,
  wsId: string,
  pageId: string,
  content: DocContent,
  rawByteLength: number,
): Promise<void> {
  if (rawByteLength > MAX_DOC_BYTES) {
    throw new AppError('LB_PAYLOAD_TOO_LARGE', 413, 'doc exceeds 1MB');
  }
  await deps.db
    .update(pages)
    .set({ content, updatedAt: new Date() })
    .where(eq(pages.id, pageId));
  // 异步派生（08 §5）：只刷 text；失败仅记日志，不阻塞写路径
  void derivePage(deps, pageId, content).catch((err) => {
    deps.logger.warn({ pageId, err }, 'derive page failed');
  });
}

/** 派生缓存刷新（08 §5）：BlockNote JSON → text（title 真相在 pages.title，不派生） */
async function derivePage(deps: AppDeps, pageId: string, content: DocContent): Promise<void> {
  const { text } = deriveMeta(content);
  await deps.db
    .update(pages)
    .set({ text: text.slice(0, SEARCH_TEXT_LIMIT) })
    .where(eq(pages.id, pageId));
}
