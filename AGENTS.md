# AGENTS.md — Linkbase 开发规范（agent 与开发者共用）

> 面向编码 agent 与新成员的工作约定。**会话开始先读本文件与 `docs/91-进度追踪.md`**（唯一进度状态源）；任务分解见 `docs/90-执行计划.md`；设计与进度文档均在 `docs/`（随仓，仓内为准，`/workspace/docs` 仅镜像）。

## 0. 命令红线（先读，避免踩坑）

| 规则 | 原因 |
|------|------|
| **禁止跑全量 `bun run typecheck`**（会卡住） | `apps/web` 的 `tsc --noEmit` 会把 69 个 vendored BlockSuite 包源码全部拉入，极慢呈卡死状 |
| 需要类型/构建反馈时 | server / 共享包：单包 `cd <pkg> && bunx tsc --noEmit`；前端：`bun run build`（Vite/rolldown 顺带验证类型边角） |
| **禁止跑 `bun test packages/blocksuite`** | 那是上游自带内部测试（112 个 fail 属正常），根 `test` 脚本已收窄排除 |
| 根 `test` 只跑 `apps/server packages/database packages/ydoc packages/contracts` | 上游测试不属于本项目回归范围 |

## 1. 常用命令

```bash
bun install            # 安装（Bun workspace 隔离式布局：各包自带 node_modules）
bun run dev            # 并行起 server(:3001) + web(:5173)
bun run test           # server + database/ydoc/contracts 的 bun test
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

### Yjs（packages/ydoc）
- **Y.Doc 只存在于 `@linkbase/ydoc` 内部**：server 其余代码只操作 `Uint8Array`；yjs 必须单实例（根 package.json overrides 钉死）；
- 派生对齐语义（08 §5）：提取到**非空** title 才覆盖 `pages.title`；doc 无标题信息时不得清空库内已有标题。

### 前端（apps/web：React 19 + Vite + Tailwind 4）
- UI 只消费语义 token（shadcn 变量 + `@theme inline`），**禁止裸色值**；换风格只改 `styles/tokens.css`；
- 依赖版本红线见 `docs/06-前端架构与UI设计.md` §1.1（React 19 自定义元素、yjs 单实例、Zod 同版等）；
- Lit（BlockSuite web components 所需）已引入，勿重复添加。

### i18n（docs/13）
- app chrome 全量 i18n（zh-CN 默认 + en，5 命名空间）；API 错误按 `LB_*` code 本地化；**用户内容永不翻译**；
- 改文案后跑 `node scripts/check-i18n.mjs`（key 对齐 / LB_* 码 / 硬编码扫描）。

## 4. 测试规约

- server 用 **bun test**，web 组件用 **Vitest**，分工勿混；
- `app.request()` 发 JSON body **必须带 `content-type: application/json`**——zValidator 不解析无此头的 body（Fastify 会自动解析，Hono 不会；已踩坑）；
- 接口测试自隔离：邮箱用 `t0-<时间戳>-<随机>@linkbase.test` 前缀，不做跨运行清理；
- 新端点必须有 DB 门控接口测试（`describe.skipIf(!process.env.DATABASE_URL)`），覆盖 401/403/409/413 等错误路径。

## 5. BlockSuite vendor 纪律（docs/05）

- 69 包 0.22.4 vendored 在 `packages/blocksuite/`，同步报告 `vendor-report.md`；web 通过 `@blocksuite/affine: workspace:*` 引用；
- **修改 vendored 源码必须登记 `docs/91-进度追踪.md` §5 补丁表**（日期/文件/原因）；
- 行为存疑直接读 vendored 源码；API 事实先查 `docs/05-BlockSuite集成设计.md` §10（0.22.4 实测表）。

## 6. 文档纪律

- **每次开发会话结束必须更新 `docs/91-进度追踪.md`**：§1 当前状态、§3 任务看板、§6 变更记录；
- 91 是唯一状态源：任务状态只在 91 记；设计变更回填对应设计文档（01–13）并在 91 §6 记一行；
- BlockSuite 本地补丁登记 91 §5；风险变化更新 91 §4。

## 7. Git 提交

- Conventional Commits + 中文描述：`fix: ...` / `feat: ...` / `chore: ...` / `docs: ...`（参考现有历史）；
- vendored `packages/blocksuite/` 与业务改动分开提交，保持可回溯；
- `.run/`（nginx 运行时）、`dist/`、`node_modules/` 已 ignore，勿入库。
