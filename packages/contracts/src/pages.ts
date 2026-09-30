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

// ---- 文档内容（BlockNote，05 §4）----

/** BlockNote 块：type + props/content/children（形状由 schema 自决，宽松透传） */
export const docBlockSchema = z.looseObject({
  id: z.string().max(64).optional(),
  type: z.string().max(32),
});

/** 10 §5.2：GET/PUT /doc 载荷（BlockNote 文档 = 块数组，05 §2） */
export const docContentSchema = z.array(docBlockSchema).max(2000);
export type DocContent = z.infer<typeof docContentSchema>;

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
