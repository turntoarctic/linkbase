import { z } from 'zod';
import { localeSchema, nameSchema } from './common';
import { userSchema } from './auth';

/** 10 §2.1：PATCH /users/me（locale 持久化跨端语言偏好，13 §6） */
export const patchMeSchema = z.object({
  name: nameSchema.optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
  locale: localeSchema.optional(),
});
export type PatchMeInput = z.infer<typeof patchMeSchema>;

export const patchMeSuccessSchema = userSchema;
