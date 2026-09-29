-- 0000_init —— 初始 schema（与 08 §3 DDL 逐列一致）
-- pg_trgm 必须在索引之前（08 §1）
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text NOT NULL,
  avatar_url text,
  locale text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
--> statement-breakpoint
CREATE TABLE workspaces (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  avatar_url text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE workspace_members (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT members_role_check CHECK (role IN ('owner','admin','member')),
  PRIMARY KEY (workspace_id, user_id)
);
--> statement-breakpoint
CREATE INDEX idx_members_user ON workspace_members(user_id);
--> statement-breakpoint
CREATE TABLE pages (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  icon text,
  is_trash boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  is_template boolean NOT NULL DEFAULT false,
  parent_id uuid,
  text text NOT NULL DEFAULT '',
  search_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(text,''))) STORED,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_pages_ws ON pages(workspace_id) WHERE NOT is_trash;
--> statement-breakpoint
CREATE INDEX idx_pages_parent ON pages(parent_id) WHERE parent_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_pages_search ON pages USING gin(search_tsv);
--> statement-breakpoint
CREATE INDEX idx_pages_trgm ON pages USING gin (title gin_trgm_ops, text gin_trgm_ops);
--> statement-breakpoint
CREATE TABLE page_updates (
  id bigserial PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  blob bytea NOT NULL,
  actor uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX idx_updates_page ON page_updates(page_id, id);
--> statement-breakpoint
CREATE TABLE page_snapshots (
  id bigserial PRIMARY KEY,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version integer NOT NULL,
  blob bytea NOT NULL,
  reason text NOT NULL DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT page_snapshots_page_version_key UNIQUE (page_id, version),
  CONSTRAINT snapshots_reason_check CHECK (reason IN ('auto','manual','restore','copy'))
);
--> statement-breakpoint
CREATE TABLE blobs (
  id text PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  mime text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE tags (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  color smallint NOT NULL DEFAULT 6,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tags_ws_name_key UNIQUE (workspace_id, name),
  CONSTRAINT tags_color_check CHECK (color BETWEEN 1 AND 8)
);
--> statement-breakpoint
CREATE TABLE page_tags (
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (page_id, tag_id)
);
--> statement-breakpoint
CREATE INDEX idx_page_tags_tag ON page_tags(tag_id);
--> statement-breakpoint
CREATE TABLE favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);
--> statement-breakpoint
CREATE TABLE page_visits (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  page_id uuid NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, page_id)
);
