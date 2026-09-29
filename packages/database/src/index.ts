/**
 * 数据库连接（07 §1/§2）：Bun.SQL 原生驱动 + Drizzle。
 * 注意：跨包传递只允许 Uint8Array / 纯数据；Y.Doc 实例只存在于 @linkbase/ydoc 内部。
 */
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import * as schema from './schema';

export function createDb(url: string) {
  const client = new SQL(url);
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof createDb>['db'];
export type DbClient = ReturnType<typeof createDb>['client'];
export { schema };
export * from './schema';
