/**
 * Y.Doc 通路（08 §4 / 10 §5.2）。
 * 边界：Y.Doc 只在 @linkbase/ydoc 内部，本服务只操作 Uint8Array。
 */
import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { pageSnapshots, pageUpdates, pages } from '@linkbase/database';
import {
  diffUpdate,
  extractMetaFromState,
  fromBase64,
  mergeUpdates,
  SEARCH_TEXT_LIMIT,
  stateVectorFromUpdate,
  svContains,
} from '@linkbase/ydoc';
import { pageNotFound, badRequest, AppError } from '../lib/errors';
import type { AppDeps } from '../types';

const MAX_UPDATE_BYTES = 512 * 1024; // 10 §1
const SNAPSHOT_MERGE_THRESHOLD = 50; // 08 §4.3

function toU8(v: Uint8Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}

async function latestSnapshot(deps: AppDeps, pageId: string) {
  const rows = await deps.db
    .select()
    .from(pageSnapshots)
    .where(eq(pageSnapshots.pageId, pageId))
    .orderBy(desc(pageSnapshots.version))
    .limit(1);
  return rows[0] ?? null;
}

async function listUpdates(deps: AppDeps, pageId: string, afterId?: number) {
  const where =
    afterId !== undefined
      ? and(eq(pageUpdates.pageId, pageId), gt(pageUpdates.id, afterId))
      : eq(pageUpdates.pageId, pageId);
  const rows = await deps.db
    .select({ id: pageUpdates.id, blob: pageUpdates.blob })
    .from(pageUpdates)
    .where(where)
    .orderBy(asc(pageUpdates.id));
  return rows;
}

/** 页面当前全量状态（快照 ∪ 未合并增量）；空页返回 null（08 §4.1） */
export async function pageState(
  deps: AppDeps,
  pageId: string,
): Promise<{ state: Uint8Array; snapshotVersion: number } | null> {
  const snap = await latestSnapshot(deps, pageId);
  const updates = await listUpdates(deps, pageId, snap?.id);
  if (!snap && updates.length === 0) return null;
  const parts: Uint8Array[] = [];
  if (snap) parts.push(toU8(snap.blob));
  for (const u of updates) parts.push(toU8(u.blob));
  return { state: mergeUpdates(parts), snapshotVersion: snap?.version ?? 0 };
}

/** 08 §4.1 pull：按客户端 state vector 差分；空页 → LB_PAGE_NOT_FOUND */
export async function pullDoc(
  deps: AppDeps,
  pageId: string,
  stateB64?: string,
): Promise<Uint8Array> {
  const snap = await latestSnapshot(deps, pageId);
  const updates = await listUpdates(deps, pageId, snap?.id);
  if (!snap && updates.length === 0) throw pageNotFound();

  const clientSv = stateB64 ? fromBase64(stateB64) : new Uint8Array();
  if (stateB64 && clientSv.byteLength === 0 && stateB64.length > 0) {
    throw badRequest('invalid state vector base64');
  }

  // 快路径：客户端状态已包含在最新快照里，只差分快照（08 §4.1 第 1 步）
  if (snap && updates.length === 0) {
    const snapSv = stateVectorFromUpdate(toU8(snap.blob));
    if (clientSv.byteLength === 0 || svContains(snapSv, clientSv)) {
      return diffUpdate(toU8(snap.blob), clientSv);
    }
  }

  const merged = mergeUpdates([
    ...(snap ? [toU8(snap.blob)] : []),
    ...updates.map((u) => toU8(u.blob)),
  ]);
  return diffUpdate(merged, clientSv);
}

/** 08 §4.2 push：校验大小 → 插增量 → 刷 updated_at；派生缓存异步对齐（不阻塞写路径） */
export async function pushDoc(deps: AppDeps, userId: string, wsId: string, pageId: string, body: ArrayBuffer): Promise<void> {
  if (body.byteLength === 0) throw badRequest('empty update body');
  if (body.byteLength > MAX_UPDATE_BYTES) {
    throw new AppError('LB_PAYLOAD_TOO_LARGE', 413, 'update exceeds 512KB');
  }
  const blob = new Uint8Array(body);
  await deps.db.insert(pageUpdates).values({ pageId, blob, actor: userId });
  await deps.db.update(pages).set({ updatedAt: new Date() }).where(eq(pages.id, pageId));
  // 异步对齐：失败只记日志（08 §4.2/§5，不阻塞写路径）
  void derivePage(deps, wsId, pageId).catch((err) => {
    deps.logger.warn({ pageId, err }, 'derive page failed');
  });
}

/**
 * 派生缓存刷新（08 §5）：title / text / 子页 parent_id；达到阈值顺带快照合并。
 */
export async function derivePage(deps: AppDeps, wsId: string, pageId: string): Promise<void> {
  const state = await pageState(deps, pageId);
  if (!state || state.state.byteLength === 0) return;
  const meta = extractMetaFromState(state.state);
  await deps.db
    .update(pages)
    .set({ title: meta.title, text: meta.text.slice(0, SEARCH_TEXT_LIMIT) })
    .where(eq(pages.id, pageId));
  // 子页面块 → 子页的 parent_id（08 §5：一个页面最多一个父页；同空间约束）
  for (const childId of meta.subPageIds) {
    await deps.db
      .update(pages)
      .set({ parentId: pageId })
      .where(and(eq(pages.id, childId), eq(pages.workspaceId, wsId)));
  }
  await maybeMergeSnapshot(deps, pageId);
}

/** 08 §4.3：快照合并（version+1，写快照 → 删已并入增量；事务保证一致） */
export async function mergePageSnapshot(
  deps: AppDeps,
  pageId: string,
  reason: 'auto' | 'manual' | 'restore' | 'copy' = 'auto',
): Promise<{ version: number } | null> {
  const updates = await listUpdates(deps, pageId);
  if (updates.length === 0) return null;
  return await deps.db.transaction(async (tx) => {
    const snapRows = await tx
      .select()
      .from(pageSnapshots)
      .where(eq(pageSnapshots.pageId, pageId))
      .orderBy(desc(pageSnapshots.version))
      .limit(1);
    const snap = snapRows[0];
    const state = mergeUpdates([...(snap ? [toU8(snap.blob)] : []), ...updates.map((u) => toU8(u.blob))]);
    const version = (snap?.version ?? 0) + 1;
    await tx.insert(pageSnapshots).values({ pageId, version, blob: state, reason });
    await tx.delete(pageUpdates).where(eq(pageUpdates.pageId, pageId));
    return { version };
  });
}

async function maybeMergeSnapshot(deps: AppDeps, pageId: string): Promise<void> {
  const rows = await deps.db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(pageUpdates)
    .where(eq(pageUpdates.pageId, pageId));
  if ((rows[0]?.cnt ?? 0) >= SNAPSHOT_MERGE_THRESHOLD) {
    await mergePageSnapshot(deps, pageId, 'auto');
  }
}
