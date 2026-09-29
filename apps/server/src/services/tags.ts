import { and, asc, eq } from 'drizzle-orm';
import { pageTags, tags } from '@linkbase/database';
import { AppError, notFound } from '../lib/errors';
import type { AppDeps } from '../types';
import type { CreateTagInput } from '@linkbase/contracts';

type TagRow = typeof tags.$inferSelect;

function toTag(t: TagRow) {
  return { id: t.id, name: t.name, color: t.color, createdAt: t.createdAt.toISOString() };
}

export async function listTags(deps: AppDeps, wsId: string) {
  const rows = await deps.db.select().from(tags).where(eq(tags.workspaceId, wsId)).orderBy(asc(tags.createdAt));
  return rows.map(toTag);
}

export async function createTag(deps: AppDeps, wsId: string, input: CreateTagInput) {
  const id = Bun.randomUUIDv7();
  try {
    await deps.db.insert(tags).values({ id, workspaceId: wsId, name: input.name, color: input.color });
  } catch (err) {
    // unique (workspace_id, name) 冲突 → LB_TAG_EXISTS（10 §6）
    if (err instanceof Error && err.message.includes('tags_ws_name_key')) {
      throw new AppError('LB_TAG_EXISTS', 409, 'tag name already exists');
    }
    throw err;
  }
  const rows = await deps.db.select().from(tags).where(eq(tags.id, id)).limit(1);
  return toTag(rows[0]!);
}

export async function patchTag(
  deps: AppDeps,
  wsId: string,
  tagId: string,
  input: { name?: string; color?: number },
) {
  const rows = await deps.db
    .update(tags)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
    })
    .where(and(eq(tags.id, tagId), eq(tags.workspaceId, wsId)))
    .returning();
  if (!rows[0]) throw notFound('tag not found');
  return toTag(rows[0]);
}

export async function deleteTag(deps: AppDeps, wsId: string, tagId: string): Promise<void> {
  // page_tags 级联清（08 §3.5）
  const rows = await deps.db.delete(tags).where(and(eq(tags.id, tagId), eq(tags.workspaceId, wsId))).returning({ id: tags.id });
  if (!rows[0]) throw notFound('tag not found');
}

export async function tagPage(deps: AppDeps, wsId: string, pageId: string, tagId: string): Promise<void> {
  // 校验 tag 属于本空间
  const rows = await deps.db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.workspaceId, wsId)))
    .limit(1);
  if (!rows[0]) throw notFound('tag not found');
  await deps.db.insert(pageTags).values({ pageId, tagId }).onConflictDoNothing();
}

export async function untagPage(deps: AppDeps, pageId: string, tagId: string): Promise<void> {
  await deps.db.delete(pageTags).where(and(eq(pageTags.pageId, pageId), eq(pageTags.tagId, tagId)));
}

export async function pageTagList(deps: AppDeps, pageId: string) {
  const rows = await deps.db
    .select({ tag: tags })
    .from(pageTags)
    .innerJoin(tags, eq(tags.id, pageTags.tagId))
    .where(eq(pageTags.pageId, pageId));
  return rows.map((r) => toTag(r.tag));
}
