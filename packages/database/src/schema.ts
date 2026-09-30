/**
 * 全部表结构 —— 08 §3 的 Drizzle 映射（唯一事实源是 08，本文件与其逐列对应）。
 * 主键 UUID v7 由服务端生成（Bun.randomUUIDv7），不设 DB 默认值。
 * `pages.search_tsv` 为生成列；trigram/tsvector 索引依赖 pg_trgm（迁移 0000 开头创建）。
 */
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

export const bytea = customType<{ data: Uint8Array; driverData: Uint8Array }>({
  dataType() {
    return 'bytea';
  },
});

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return 'tsvector';
  },
});

// ---- 3.1 users ----

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  /** 13 §3：'zh-CN' | 'en'，空 = 未设置 */
  locale: text('locale'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ---- 3.2 workspaces / workspace_members ----

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    check('members_role_check', sql`${t.role} in ('owner','admin','member')`),
    index('idx_members_user').on(t.userId),
  ],
);

// ---- 3.3 pages ----

export const pages = pgTable(
  'pages',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    /** 派生缓存：title 由 PATCH 唯一写入；text 由服务端从 content JSON 提取（08 §5） */
    title: text('title').notNull().default(''),
    /** 文档内容真相：BlockNote 块数组（05 §4） */
    content: jsonb('content'),
    icon: text('icon'),
    isTrash: boolean('is_trash').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    isTemplate: boolean('is_template').notNull().default(false),
    parentId: uuid('parent_id'),
    /** 兄弟排序键（08 §3.3）：move 中点插入，树序 = position, createdAt */
    position: doublePrecision('position').notNull().default(0),
    text: text('text').notNull().default(''),
    searchTsv: tsvector('search_tsv').generatedAlwaysAs(
      sql`to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(text,''))`,
    ),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('idx_pages_ws').on(t.workspaceId).where(sql`not is_trash`),
    index('idx_pages_parent').on(t.parentId).where(sql`parent_id is not null`),
    index('idx_pages_search').using('gin', t.searchTsv),
    index('idx_pages_trgm').using(
      'gin',
      t.title.op('gin_trgm_ops'),
      t.text.op('gin_trgm_ops'),
    ),
  ],
);

// ---- 3.4 blobs ----

export const blobs = pgTable('blobs', {
  /** 内容寻址（sha256 前 32 hex） */
  id: text('id').primaryKey(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  /** MVP 库内存储；>5GB 后外移对象存储（08 §7） */
  data: bytea('data').notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: smallint('color').notNull().default(6),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('tags_ws_name_key').on(t.workspaceId, t.name),
    check('tags_color_check', sql`${t.color} between 1 and 8`),
  ],
);

export const pageTags = pgTable(
  'page_tags',
  {
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.pageId, t.tagId] }), index('idx_page_tags_tag').on(t.tagId)],
);

export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pageId] })],
);

/** P1 建表即可（08 §3.5） */
export const pageVisits = pgTable(
  'page_visits',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    visitedAt: timestamp('visited_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.pageId] })],
);
