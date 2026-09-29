import { z } from 'zod';
import { idSchema, nameSchema } from './common';

export const roleSchema = z.enum(['owner', 'admin', 'member']);
export type Role = z.infer<typeof roleSchema>;

// ---- 请求 ----

export const createWorkspaceSchema = z.object({ name: nameSchema });
export const patchWorkspaceSchema = z.object({
  name: nameSchema.optional(),
  avatarUrl: z.string().max(2048).nullable().optional(),
});
/** 角色变更不含 owner——owner 只能通过 /transfer 转让（10 §3） */
export const patchMemberSchema = z.object({ role: z.enum(['admin', 'member']) });
export const transferOwnerSchema = z.object({ toUserId: idSchema });
export const inviteSchema = z.object({ email: z.string().optional() });

// ---- 响应 ----

export const workspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
  role: roleSchema,
  memberCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const memberSchema = z.object({
  userId: z.uuid(),
  email: z.string(),
  name: z.string(),
  role: roleSchema,
  joinedAt: z.string(),
});

export const inviteResultSchema = z.object({
  inviteUrl: z.string(),
  expiresAt: z.string(),
});

/** 10 §3：GET /invites/:token（公开） */
export const inviteInfoSchema = z.object({
  workspaceName: z.string(),
  inviterName: z.string(),
  expiresAt: z.string(),
});
