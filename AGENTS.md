# AGENTS.md — Linkbase 开发规范（agent 与开发者共用）

> 面向编码 agent 与新成员的工作约定。**会话开始先读本文件与 `docs/91-进度追踪.md`**（唯一进度状态源）；任务分解见 `docs/90-执行计划.md`；设计与进度文档均在 `docs/`（随仓，仓内为准，`/workspace/docs` 仅镜像）。

## 0. 命令红线（先读，避免踩坑）

| 规则 | 原因 |
|------|------|
| **单包 typecheck 均可跑**（含 web，2026-09-30 后 vendored blocksuite 已删） | `cd <pkg> && bunx tsc --noEmit` 秒级；web 的类型问题直接用 tsc 抓 |
| 根 `bun run typecheck` 用 `--filter '*'` 串联全包，较慢但不再卡死 | 需要时跑；日常开发用单包 |
| **禁止跑 blocksuite 上游测试** | BlockSuite 已于 2026-09-30 退役（BlockNote 接棒，05）；`packages/blocksuite/` 已删除 |

## 1. 常用命令

```bash
bun install            # 安装（Bun workspace 隔离式布局：各包自带 node_modules）
bun run dev            # 并行起 server(:3001) + web(:5173)
bun run test           # server + database/contracts 的 bun test
bun run check          # typecheck + test + i18n 守护（⚠️ 含 typecheck，勿轻易跑）
bun run build          # 前端产物 → apps/web/dist
bun run serve          # 单独起后端（读根 .env）
bun run db:migrate     # 执行迁移（读根 .env 的 DATABASE_URL）
bun run stack:start    # 用户态 nginx(:30177) 静态 + 反代（scripts/stack.sh）
STACK_CONF=$PWD/deploy/nginx/nginx.dev.conf ./scripts/stack.sh start   # dev 态：:30177 → vite :5173（/api、/ws 由 vite 转发 :3001；生产恢复 = bun run build 后默认 start）
```

## 2. 环境事实

- **PostgreSQL 17.11** 本机可用：`127.0.0.1:5432`；超级用户 `postgres`（密码不入库，见运维交接/本机密码管理器）；应用角色 `linkbase/linkbase` + 库 `linkbase` + `pg_trgm` 已建好（幂等脚本 `scripts/setup-db.sh`，需 sudo 时可参照其 SQL 以 TCP 执行）；
- `.env` 在仓库根，`DATABASE_URL=postgres://linkbase:linkbase@127.0.0.1:5432/linkbase`；
- **Redis 不可用**：`REDIS_URL` 缺省，服务端自动降级进程内存 KV（仅单实例开发，启动日志有告警，属预期）；
- 接口/服务测试需要真 PG：`DATABASE_URL=... bun run test`；未设置时 DB 门控测试整组 skip。

## 3. 代码规约

### 后端（apps/server：Bun + Hono 函数式）
- 全仓 ESM；路由薄，业务在 `src/services/`；service 层只 `throw new AppError(code, status, message)`（`lib/errors.ts`），禁止路由拼错误响应；
- 请求校验唯一入口：`@linkbase/contracts` 的 Zod schema + `zValidator('json', ...)`；契约前后端同源，禁止两端各写一份；
- 捕获 PG 唯一冲突必须用 `lib/errors.ts` 的 `isUniqueViolation(err, constraintName)`——drizzle 会把驱动错误包进 `DrizzleQueryError.cause`，直接读 `err.message` 匹配不到；
- 认证：JWT 双 token + refresh 旋转（旋转后旧 token 立即失效）；密码 `Bun.password` Argon2id；
- 限流：Redis INCR+EXPIRE，内存降级（07 §3）；register 3/h、login 5/min。

### 数据库（packages/database：Drizzle + PG）
- Schema 全表定义在 `packages/database/src/`，手写迁移在 `drizzle/*.sql`（`--> statement-breakpoint` 分语句）；
- `_linkbase_migrations` 簿记表归迁移器（`src/migrate.ts`）所有，**迁移 SQL 里禁止再建**；
- 迁移器带 advisory lock，幂等可重入；每文件一个事务。

### Yjs（原 packages/ydoc）
- **已退役（2026-09-30）**：编辑器切 BlockNote，服务端不再有 yjs；文档内容 = `pages.content` JSONB（BlockNote 块数组，05 §2）；
- 派生语义：`apps/server/src/lib/editor-meta.ts` 从 content JSON 提取 `text` 供搜索；**title 真相在 `pages.title`，PATCH 是唯一写入口**，任何路径不得从内容反向覆盖标题。

### 前端（apps/web：React 19 + Vite + Tailwind 4）
- UI 只消费语义 token（shadcn 变量 + `@theme inline`），**禁止裸色值**；换风格只改 `styles/tokens.css`；
- 依赖版本红线见 `docs/06-前端架构与UI设计.md` §1.1（React 19 单实例、Zod 同版等）；
- 编辑器 = BlockNote 0.55.x（05）：schema 全量定义在 `features/editor/schema.ts`（默认块全量 + 代码高亮/多栏/数学官方扩展，能力清单 05 §2），挂载与自动保存在 `editor-view.tsx`（uploadFile → blobs、zh/en 字典随 i18next）；块状态不复制进 React state。

### i18n（docs/13）
- app chrome 全量 i18n（zh-CN 默认 + en，5 命名空间）；API 错误按 `LB_*` code 本地化；**用户内容永不翻译**；
- 改文案后跑 `node scripts/check-i18n.mjs`（key 对齐 / LB_* 码 / 硬编码扫描）。

## 4. 测试规约

- server 用 **bun test**，web 组件用 **Vitest**，分工勿混；
- `app.request()` 发 JSON body **必须带 `content-type: application/json`**——zValidator 不解析无此头的 body（Fastify 会自动解析，Hono 不会；已踩坑）；
- 接口测试自隔离：邮箱用 `t0-<时间戳>-<随机>@linkbase.test` 前缀，不做跨运行清理；
- 新端点必须有 DB 门控接口测试（`describe.skipIf(!process.env.DATABASE_URL)`），覆盖 401/403/409/413 等错误路径。

## 5. 依赖红线（原 BlockSuite vendor 纪律，已退役）

- `packages/blocksuite/`（vendored 69 包）与 `packages/ydoc/` 已删除；勿从旧文档/旧提交恢复；
- 编辑器依赖（`@editorjs/*`）走 npm + `bun.lock` 锁定，升级 = `bun update` + 全量回归；行为存疑直接读 `node_modules/@editorjs/editorjs/types`。

## 6. 文档纪律

- **每次开发会话结束必须更新 `docs/91-进度追踪.md`**：§1 当前状态、§3 任务看板、§6 变更记录；
- 91 是唯一状态源：任务状态只在 91 记；设计变更回填对应设计文档（01–13）并在 91 §6 记一行；
- 风险变化更新 91 §4。

## 7. Git 提交

- Conventional Commits + 中文描述：`fix: ...` / `feat: ...` / `chore: ...` / `docs: ...`（参考现有历史）；
- 依赖/锁文件变更与业务改动分开提交，保持可回溯；
- `.run/`（nginx 运行时）、`dist/`、`node_modules/` 已 ignore，勿入库。
