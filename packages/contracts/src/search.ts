import { z } from 'zod';
import { idSchema } from './common';

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
});

/** 10 §7：搜索结果（含面包屑，08 §6） */
export const searchItemSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  breadcrumb: z.array(z.object({ id: idSchema, title: z.string() })),
});
