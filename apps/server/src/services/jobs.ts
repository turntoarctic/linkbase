/**
 * 进程内轻量定时任务（07 §6）：trash-cleanup（每小时）+ snapshot-merge（每小时，随机错峰）。
 * 幂等；结果进日志。
 */
import { and, eq, lt, sql } from 'drizzle-orm';
import { pageUpdates, pages } from '@linkbase/database';
import type { AppDeps } from '../types';
import { purgeIds } from './pages';
import { mergePageSnapshot } from './docs';

const TRASH_RETENTION_MS = 30 * 24 * 3600 * 1000; // 08 §1：回收站 30 天

export async function trashCleanup(deps: AppDeps): Promise<{ purged: number }> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_MS);
  const stale = await deps.db
    .select({ id: pages.id })
    .from(pages)
    .where(and(eq(pages.isTrash, true), lt(pages.deletedAt, cutoff)));
  await purgeIds(deps, stale.map((r) => r.id));
  return { purged: stale.length };
}

export async function snapshotMergeTick(deps: AppDeps): Promise<{ merged: number }> {
  // 触发条件（08 §4.3）：某页自上次快照累计 updates ≥ 50；或 updated_at 距今 > 1h 且仍有增量
  const rows = await deps.db
    .select({ pageId: pageUpdates.pageId, cnt: sql<number>`count(*)::int` })
    .from(pageUpdates)
    .groupBy(pageUpdates.pageId);
  let merged = 0;
  for (const r of rows) {
    const pageRows = await deps.db
      .select({ updatedAt: pages.updatedAt })
      .from(pages)
      .where(eq(pages.id, r.pageId))
      .limit(1);
    const updatedAt = pageRows[0]?.updatedAt.getTime() ?? 0;
    if (r.cnt >= 50 || Date.now() - updatedAt > 3600_000) {
      await mergePageSnapshot(deps, r.pageId, 'auto');
      merged += 1;
    }
  }
  return { merged };
}

export function scheduleJobs(deps: AppDeps): void {
  const jitter = (ms: number) => ms * 0.5 + Math.random() * ms * 0.5; // 启动随机延迟错峰
  const run = async (name: string, fn: (d: AppDeps) => Promise<unknown>) => {
    try {
      const result = (await fn(deps)) as Record<string, unknown>;
      deps.logger.info({ job: name, ...result }, 'job done');
    } catch (err) {
      deps.logger.error({ job: name, err }, 'job failed');
    }
  };
  setTimeout(() => {
    void run('trash-cleanup', trashCleanup);
    const t = setInterval(() => void run('trash-cleanup', trashCleanup), 3600_000);
    t.unref?.();
  }, jitter(60_000)).unref?.();
  setTimeout(() => {
    void run('snapshot-merge', snapshotMergeTick);
    const t = setInterval(() => void run('snapshot-merge', snapshotMergeTick), 3600_000);
    t.unref?.();
  }, jitter(120_000)).unref?.();
}
