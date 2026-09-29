import { z } from 'zod';
import { idSchema, pageIconSchema } from './common';

// ---- 请求 ----

/** 10 §4：建页（templateId 走复制流程 08 §4.4） */
export const createPageSchema = z.object({
  title: z.string().max(255).optional(),
  icon: pageIconSchema.optional(),
  parentId: idSchema.optional(),
  templateId: idSchema.optional(),
});
export type CreatePageInput = z.infer<typeof createPageSchema>;

/** title 仅作乐观展示回填；真相以 Y.Doc 提取为准（10 §4 注意） */
export const patchPageSchema = z.object({
  title: z.string().max(255).optional(),
  icon: pageIconSchema.nullable().optional(),
});

/** 10 §4：拖拽换序/换父（T1.3）。afterId=null = 插入目标兄弟列表头部 */
export const movePageSchema = z.object({
  parentId: z.uuid().nullable().optional(),
  afterId: z.uuid().nullable().optional(),
});
export type MovePageInput = z.infer<typeof movePageSchema>;

// ---- 响应 ----

export const pageMetaSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  title: z.string(),
  icon: z.string().nullable(),
  parentId: z.uuid().nullable(),
  isTemplate: z.boolean(),
  isTrash: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PageMeta = z.infer<typeof pageMetaSchema>;

/** 10 §4：页面树节点（递归） */
export interface PageTreeNode extends z.infer<typeof pageMetaSchema> {
  children: PageTreeNode[];
}
export const pageTreeNodeSchema: z.ZodType<PageTreeNode> =
  pageMetaSchema.extend({ children: z.lazy(() => z.array(pageTreeNodeSchema)) });

/** 回收站条目：扁平 + 路径面包屑 */
export const trashItemSchema = z.object({
  page: pageMetaSchema,
  path: z.array(z.object({ id: z.uuid(), title: z.string() })),
});
