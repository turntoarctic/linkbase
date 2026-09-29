# Linkbase

面向研发团队的 Notion：万物基于 Block 的协作知识库。设计与进度文档见 [docs/](./docs)（`90-执行计划` 是任务分解，`91-进度追踪` 是唯一状态源）。

## 技术栈

Bun + Hono + PostgreSQL（Drizzle）+ Redis（会话/限流）+ WebSocket + Yjs；前端 React 19 + Vite + Tailwind 4；编辑器 BlockSuite（vendor 本地源码，T0.2）。

## 结构

```
apps/server    Hono on Bun API + WS + 静态托管
apps/web       React 前端（含 i18n：zh-CN/en）
apps/e2e       Playwright
packages/contracts   Zod 契约（前后端同源）+ LB_* 错误码
packages/database    Drizzle schema + 迁移
packages/ydoc        纯 yjs 工具（merge/diff/元数据提取，服务端零 DOM）
packages/blocksuite  vendor 的 BlockSuite 源码（T0.2 生成）
```

## 常用命令

```bash
bun install
bun run check        # typecheck + test + i18n 守护
bun run dev          # 并行起 server(3001) + web(5173)
bun run db:migrate   # 执行迁移（需 DATABASE_URL）
bun run db:generate  # drizzle-kit 生成迁移 diff
```

环境变量见 `.env.example`；接口清单见 `docs/10-API设计规范.md`。
