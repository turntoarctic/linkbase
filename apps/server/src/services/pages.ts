import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { favorites, pageVisits, pages } from '@linkbase/database';
import { badRequest, notFound } from '../lib/errors';
import type { AppDeps } from '../types';
import type { CreatePageInput, MovePageInput, PageMeta, PageTreeNode } from '@linkbase/contracts';

type PageRow = typeof pages.$inferSelect;

export function toMeta(p: PageRow): PageMeta {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    title: p.title,
    icon: p.icon ?? null,
    parentId: p.parentId ?? null,
    isTemplate: p.isTemplate,
    isTrash: p.isTrash,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

async function listWsPages(deps: AppDeps, wsId: string): Promise<PageRow[]> {
  return await deps.db
    .select()
    .from(pages)
    .where(eq(pages.workspaceId, wsId))
    .orderBy(asc(pages.position), asc(pages.createdAt));
}

/** 10 §4：非回收站全量树 */
export async function listTree(deps: AppDeps, wsId: string): Promise<PageTreeNode[]> {
  const rows = (await listWsPages(deps, wsId)).filter((p) => !p.isTrash);
  const byId = new Map<string, PageTreeNode>();
  for (const p of rows) byId.set(p.id, { ...toMeta(p), children: [] });
  const roots: PageTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

async function getWsPage(deps: AppDeps, wsId: string, pageId: string): Promise<PageRow> {
  const rows = await deps.db
    .select()
    .from(pages)
    .where(and(eq(pages.id, pageId), eq(pages.workspaceId, wsId)))
    .limit(1);
  const page = rows[0];
  if (!page) throw notFound('page not found');
  return page;
}

/** 10 §4：建页（templateId → 08 §4.4 复制流程） */
export async function createPage(deps: AppDeps, userId: string, wsId: string, input: CreatePageInput): Promise<PageMeta> {
  if (input.templateId) {
    const tpl = await getWsPage(deps, wsId, input.templateId);
    const pageId = Bun.randomUUIDv7();
    await deps.db.insert(pages).values({
      id: pageId,
      workspaceId: wsId,
      title: input.title ?? tpl.title,
      icon: input.icon ?? tpl.icon ?? null,
      content: tpl.content,
      createdBy: userId,
    });
    const created = await getWsPage(deps, wsId, pageId);
    return toMeta(created);
  }

  if (input.parentId) {
    const parent = await getWsPage(deps, wsId, input.parentId);
    if (parent.isTrash) throw notFound('parent page is in trash');
  }
  const pageId = Bun.randomUUIDv7();
  await deps.db.insert(pages).values({
    id: pageId,
    workspaceId: wsId,
    title: input.title ?? '',
    icon: input.icon ?? null,
    parentId: input.parentId ?? null,
    createdBy: userId,
  });
  const created = await getWsPage(deps, wsId, pageId);
  return toMeta(created);
}

export async function getPageMeta(deps: AppDeps, wsId: string, pageId: string): Promise<PageMeta> {
  const page = await getWsPage(deps, wsId, pageId);
  return toMeta(page);
}

/** title/icon 乐观回填（10 §4）；title 真相即本列（08 §3.3） */
export async function patchPage(
  deps: AppDeps,
  wsId: string,
  pageId: string,
  input: { title?: string; icon?: string | null },
): Promise<PageMeta> {
  const rows = await deps.db
    .update(pages)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.icon !== undefined ? { icon: input.icon } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(pages.id, pageId), eq(pages.workspaceId, wsId)))
    .returning();
  const page = rows[0];
  if (!page) throw notFound('page not found');
  return toMeta(page);
}

/** 子树 id 集合（含自身）——全量取回后在内存里收敛，单空间量级可控（10 §1） */
function subtreeIds(all: PageRow[], rootId: string): string[] {
  const childrenOf = new Map<string | null, PageRow[]>();
  for (const p of all) {
    const key = p.parentId ?? null;
    const list = childrenOf.get(key) ?? [];
    list.push(p);
    childrenOf.set(key, list);
  }
  const out: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop();
    if (!id) continue;
    const row = all.find((p) => p.id === id);
    if (!row) continue;
    out.push(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child.id);
  }
  return out;
}

/**
 * 拖拽换序/换父（T1.3，10 §4）：parentId 省略 = 不换父；afterId=null = 目标兄弟列表头部。
 * 中点插入（double precision），无间隔时整列重排；禁止移入自身子树（环检查）。
 */
export async function movePage(
  deps: AppDeps,
  wsId: string,
  pageId: string,
  input: MovePageInput,
): Promise<PageMeta> {
  const page = await getWsPage(deps, wsId, pageId);
  if (page.isTrash) throw notFound('page not found');
  const all = await listWsPages(deps, wsId);
  const targetParentId = input.parentId === undefined ? page.parentId : input.parentId;
  if (targetParentId) {
    const parent = all.find((p) => p.id === targetParentId);
    if (!parent || parent.isTrash) throw notFound('parent page not found');
    // 环检查：新父不能是自己或自己的后代
    if (targetParentId === pageId || subtreeIds(all, pageId).includes(targetParentId)) {
      throw badRequest('cannot move a page into its own subtree');
    }
  }
  // 目标兄弟（不含自己，已按 position/createdAt 有序）
  const siblings = all.filter(
    (p) => !p.isTrash && p.id !== pageId && (p.parentId ?? null) === targetParentId,
  );
  let index = 0;
  if (input.afterId) {
    const i = siblings.findIndex((p) => p.id === input.afterId);
    if (i === -1) throw badRequest('afterId is not a sibling in the target list');
    index = i + 1;
  }
  const prev = siblings[index - 1]?.position;
  const next = siblings[index]?.position;
  let position: number;
  if (prev === undefined && next === undefined) position = 0;
  else if (prev === undefined) position = next! - 1;
  else if (next === undefined) position = prev + 1;
  else if (next - prev >= 1e-9) position = (prev + next) / 2;
  else {
    // 中点间隔耗尽：整列重铺（间隔 1，空出第 index+1 槽），一次 UPDATE ... FROM (VALUES …)；走至此必有 next，列表非空
    position = index + 1;
    const values = sql.join(
      siblings.map((s, i) => sql`(${s.id}::uuid, ${(i < index ? i : i + 1) + 1}::double precision)`),
      sql`, `,
    );
    await deps.db.execute(
      sql`update pages as p set position = v.pos from (values ${values}) as v(id, pos) where p.id = v.id`,
    );
  }
  const updated = await deps.db
    .update(pages)
    .set({ parentId: targetParentId, position, updatedAt: new Date() })
    .where(eq(pages.id, pageId))
    .returning();
  return toMeta(updated[0]!);
}

/** 移入回收站（含子树，10 §4） */
export async function trashPage(deps: AppDeps, wsId: string, pageId: string): Promise<number> {
  const all = await listWsPages(deps, wsId);
  const ids = subtreeIds(all, pageId);
  if (!ids.includes(pageId)) throw notFound('page not found');
  const now = new Date();
  await deps.db
    .update(pages)
    .set({ isTrash: true, deletedAt: now })
    .where(inArray(pages.id, ids));
  return ids.length;
}

/** 恢复（含子树，10 §4） */
export async function restorePage(deps: AppDeps, wsId: string, pageId: string): Promise<number> {
  const all = await listWsPages(deps, wsId);
  const ids = subtreeIds(all, pageId);
  if (!ids.includes(pageId)) throw notFound('page not found');
  await deps.db
    .update(pages)
    .set({ isTrash: false, deletedAt: null })
    .where(inArray(pages.id, ids));
  return ids.length;
}

/** 彻底删除：物理删（FK 级联清 updates/snapshots/tags/favorites） */
export async function purgePage(deps: AppDeps, wsId: string, pageId: string): Promise<number> {
  const all = await listWsPages(deps, wsId);
  const ids = subtreeIds(all, pageId);
  if (!ids.includes(pageId)) throw notFound('page not found');
  await deps.db.delete(pages).where(inArray(pages.id, ids));
  return ids.length;
}

/** 回收站列表：扁平 + 路径面包屑（10 §4） */
export async function listTrash(deps: AppDeps, wsId: string) {
  const all = await listWsPages(deps, wsId);
  const byId = new Map(all.map((p) => [p.id, p]));
  const pathOf = (p: PageRow): { id: string; title: string }[] => {
    const path: { id: string; title: string }[] = [];
    let cur = p.parentId ? byId.get(p.parentId) : undefined;
    let guard = 0;
    while (cur && guard++ < 64) {
      path.unshift({ id: cur.id, title: cur.title });
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return path;
  };
  return all
    .filter((p) => p.isTrash)
    .sort((a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0))
    .map((p) => ({ page: toMeta(p), path: pathOf(p) }));
}

export async function setFavorite(deps: AppDeps, userId: string, pageId: string): Promise<void> {
  await deps.db.insert(favorites).values({ userId, pageId }).onConflictDoNothing();
}

export async function unsetFavorite(deps: AppDeps, userId: string, pageId: string): Promise<void> {
  await deps.db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.pageId, pageId)));
}

export async function listFavorites(deps: AppDeps, userId: string, wsId: string): Promise<PageMeta[]> {
  const rows = await deps.db
    .select({ page: pages })
    .from(favorites)
    .innerJoin(pages, eq(pages.id, favorites.pageId))
    .where(and(eq(favorites.userId, userId), eq(pages.workspaceId, wsId)));
  return rows.map((r) => toMeta(r.page));
}

/** P1：访问记录 upsert（08 §3.5） */
export async function recordVisit(deps: AppDeps, userId: string, pageId: string): Promise<void> {
  await deps.db
    .insert(pageVisits)
    .values({ userId, pageId })
    .onConflictDoUpdate({
      target: [pageVisits.userId, pageVisits.pageId],
      set: { visitedAt: new Date() },
    });
}

export async function listRecents(deps: AppDeps, userId: string, wsId: string): Promise<PageMeta[]> {
  const rows = await deps.db
    .select({ page: pages, visitedAt: pageVisits.visitedAt })
    .from(pageVisits)
    .innerJoin(pages, eq(pages.id, pageVisits.pageId))
    .where(and(eq(pageVisits.userId, userId), eq(pages.workspaceId, wsId), eq(pages.isTrash, false)))
    .orderBy(desc(pageVisits.visitedAt))
    .limit(20);
  return rows.map((r) => toMeta(r.page));
}

/** jobs 用：purge 指定 id 集合（trash-cleanup） */
export async function purgeIds(deps: AppDeps, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await deps.db.delete(pages).where(inArray(pages.id, ids));
}
