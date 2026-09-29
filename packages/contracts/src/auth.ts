import { z } from 'zod';
import { emailSchema, localeSchema, nameSchema, passwordSchema } from './common';

// ---- 请求 ----

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

// ---- 响应 ----

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  locale: localeSchema.nullable(),
  createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export const workspaceRefSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

/** 10 §2：登录/刷新返回 */
export const authSuccessSchema = z.object({
  user: userSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
});

/** 10 §2：注册额外返回自动创建的工作空间（02 §1.1 零仪式） */
export const registerSuccessSchema = authSuccessSchema.extend({
  workspace: workspaceRefSchema,
});

export const meSuccessSchema = z.object({
  user: userSchema,
  workspaces: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      role: z.enum(['owner', 'admin', 'member']),
    }),
  ),
});
