/**
 * 进程内轻量定时任务（07 §6）：trash-cleanup（每小时，随机错峰）。幂等；结果进日志。
 * （snapshot-merge 已随 yjs 增量流退役，编辑器 JSON 化后无此需求）
 */
import { and, eq, lt } from 'drizzle-orm';
import { pages } from '@linkbase/database';
import type { AppDeps } from '../types';
import { purgeIds } from './pages';

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
}
