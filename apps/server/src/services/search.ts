/**
 * 搜索（08 §6）：tsvector 主路径 + trigram 兜底；simple 配置，不依赖 zhparser。
 * text 截断 20000 字符参与 trigram。
 */
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { pages } from '@linkbase/database';
import type { AppDeps } from '../types';

interface SearchRow {
  id: string;
  title: string;
  parent_id: string | null;
}

export async function search(deps: AppDeps, wsId: string, q: string) {
  const result = await deps.db.execute(sql`
    select id, title, parent_id from pages
    where workspace_id = ${wsId} and not is_trash
      and (search_tsv @@ plainto_tsquery('simple', ${q})
           or title % ${q}
           or left(text, 20000) % ${q})
    order by ts_rank(search_tsv, plainto_tsquery('simple', ${q})) desc nulls last,
             updated_at desc
    limit 20
  `);
  const rows = (result as unknown as { rows: SearchRow[] }).rows ?? (result as unknown as SearchRow[]);

  // 面包屑：父链标题（同一空间全量构建，量级可控）
  const all = await deps.db
    .select({ id: pages.id, title: pages.title, parentId: pages.parentId })
    .from(pages)
    .where(eq(pages.workspaceId, wsId));
  const byId = new Map(all.map((p) => [p.id, p]));
  const breadcrumbOf = (parentId: string | null) => {
    const path: { id: string; title: string }[] = [];
    let cur = parentId ? byId.get(parentId) : undefined;
    let guard = 0;
    while (cur && guard++ < 64) {
      path.unshift({ id: cur.id, title: cur.title });
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return path;
  };

  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    breadcrumb: breadcrumbOf(r.parent_id),
  }));
}
