/**
 * 迁移执行器（08 §1）：启动时/手动执行 drizzle/ 下按文件名排序的 SQL。
 * - 先取 PG advisory lock，防多实例并发迁移；
 * - 每个文件一个事务，记录到 _linkbase_migrations，幂等可重入。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDb } from './index';

const MIGRATIONS_DIR = join(import.meta.dir, '..', 'drizzle');
const LOCK_KEY = 'linkbase_migrations';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[migrate] DATABASE_URL is required');
    process.exit(1);
  }
  const { client } = createDb(url);
  // 独占连接保证 advisory lock 与语句同会话
  const conn = await client.reserve();
  try {
    await conn.unsafe(`create table if not exists _linkbase_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )`);
    await conn.unsafe(`select pg_advisory_lock(hashtext('${LOCK_KEY}'))`);

    const applied = new Set<string>();
    for (const row of (await conn`select name from _linkbase_migrations`) as { name: string }[]) {
      applied.add(row.name);
    }

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const raw = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
      const statements = raw
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);
      await conn.begin(async (tx) => {
        for (const stmt of statements) {
          await tx.unsafe(stmt);
        }
        await tx`insert into _linkbase_migrations (name) values (${file})`;
      });
      console.log(`[migrate] applied ${file} (${statements.length} statements)`);
    }
    await conn.unsafe(`select pg_advisory_unlock(hashtext('${LOCK_KEY}'))`);
    console.log('[migrate] up to date');
  } finally {
    // Bun SQL reserved client：尽力释放
    const r = conn as unknown as { release?: () => unknown; close?: () => unknown };
    try {
      r.release?.();
    } catch {
      r.close?.();
    }
    client.close();
  }
}

await main();
