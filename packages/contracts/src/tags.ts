import { z } from 'zod';
import { idSchema } from './common';

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(32),
  /** 对应 06 §5.1 标签色板（08 §3.5） */
  color: z.number().int().min(1).max(8).default(6),
});
export type CreateTagInput = z.infer<typeof createTagSchema>;

export const patchTagSchema = createTagSchema.partial();

export const tagSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.number().int().min(1).max(8),
  createdAt: z.string(),
});
export type Tag = z.infer<typeof tagSchema>;
