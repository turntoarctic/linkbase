import { eq } from 'drizzle-orm';
import { users } from '@linkbase/database';
import type { AppDeps } from '../types';
import type { PatchMeInput } from '@linkbase/contracts';
import { toUserRow } from '../lib/serialize';
import { notFound } from '../lib/errors';

/** 10 §2.1：PATCH /users/me（locale 持久化跨端语言偏好，13 §6） */
export async function patchMe(deps: AppDeps, userId: string, input: PatchMeInput) {
  const rows = await deps.db
    .update(users)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
      ...(input.locale !== undefined ? { locale: input.locale } : {}),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();
  const user = rows[0];
  if (!user) throw notFound('user not found');
  return toUserRow(user);
}
