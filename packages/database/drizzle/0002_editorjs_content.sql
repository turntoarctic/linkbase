-- 编辑器内核迁移（BlockSuite/yjs → BlockNote JSON，05 §4；文件名为历史命名——已被簿记表登记，勿改名）：
-- 文档内容真相收敛为 pages.content（Editor.js OutputData JSONB），
-- yjs 增量流（page_updates / page_snapshots）退役删除。
-- ⚠️ 破坏性：存量二进制增量不转换，直接丢弃（Phase 0 未上线，无存量数据）。
ALTER TABLE "pages" ADD COLUMN "content" jsonb;
--> statement-breakpoint
DROP TABLE IF EXISTS "page_updates";
--> statement-breakpoint
DROP TABLE IF EXISTS "page_snapshots";
