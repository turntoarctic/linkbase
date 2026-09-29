import type { users } from '@linkbase/database';

type UserRow = typeof users.$inferSelect;

/** 行 → API 响应（永不外泄 password_hash；时间为 ISO 8601 UTC，10 §1） */
export function toUserRow(u: UserRow) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl ?? null,
    locale: (u.locale as 'zh-CN' | 'en' | null) ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}
