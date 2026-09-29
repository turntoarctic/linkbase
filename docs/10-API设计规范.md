# 10 - API 设计规范

> 权威文档：REST 约定与**全部 MVP 端点**。错误处理机制见 07 §4，实体语义见 02。新增端点先改本文再写代码。

## 1. 通用约定

| 项 | 约定 |
|----|------|
| Base | `/api`，版本不进 URL（单体重构前无 v2 需求） |
| 格式 | JSON（UTF-8）；Yjs 端点为 `application/octet-stream`；blob 上传为 multipart |
| 认证 | `Authorization: Bearer {accessToken}`（Yjs/doc/WS 相关端点必须携带） |
| 时间 | ISO 8601 UTC（`2026-09-22T08:00:00Z`） |
| ID | UUID v7 字符串 |
| 大小 | JSON ≤ 1MB；doc update ≤ 512KB；blob ≤ 25MB |
| 分页 | MVP 页面树/列表全量返回（单空间量级可控）；P1 起列表端点统一 `?cursor=&limit=`（默认 50，上限 200），响应 `{ items, nextCursor }` |

**成功**：直接返回数据（或 `204` 无内容）。
**失败**（07 §4）：

```json
{ "error": { "code": "LB_PAGE_NOT_FOUND", "message": "页面不存在", "details": {} } }
```

> `message` 为默认语言兜底文案；**客户端按 `code` 本地化**（13 §4），不得直接展示服务端 message。

## 2. 认证 auth

| Method | Path | Body → 响应 |
|--------|------|-------------|
| POST | `/auth/register` | `{ email, password, name }` → `201 { user, accessToken, refreshToken, workspace }`（自动建空间+快速开始页，02 §1.1） |
| POST | `/auth/login` | `{ email, password }` → `200 { user, accessToken, refreshToken }` |
| POST | `/auth/refresh` | `{ refreshToken }` → `200 { accessToken, refreshToken }`（旋转，旧 token 立即失效） |
| POST | `/auth/logout` | `{ refreshToken }` → `204` |
| GET | `/auth/me` | → `200 { user, workspaces: [{ id, name, role }] }` |

### 2.1 用户资料 users

| Method | Path | 说明 |
|--------|------|------|
| PATCH | `/users/me` | `{ name?, avatarUrl?, locale? }` → `200 user`（`locale` ∈ `zh-CN\|en`，13 §6；持久化跨端语言偏好，08 §3.1） |

## 3. 工作空间 workspaces

| Method | Path | 说明 |
|--------|------|------|
| POST | `/workspaces` | `{ name }` → `201 workspace`（创建者 owner） |
| GET | `/workspaces` | 我的空间列表 |
| GET | `/workspaces/:wsId` | 详情（含成员数） |
| PATCH | `/workspaces/:wsId` | `{ name?, avatarUrl? }`（owner/admin） |
| GET | `/workspaces/:wsId/members` | 成员列表（含角色） |
| POST | `/workspaces/:wsId/invite` | `{ email? }` → `201 { inviteUrl, expiresAt }`（owner/admin；token 入 Redis 7d） |
| GET | `/invites/:token` | 邀请信息（空间名、邀请人），无需登录 |
| POST | `/invites/:token/accept` | 登录后调用 → `204`，加入空间（member） |
| PATCH | `/workspaces/:wsId/members/:userId` | `{ role }`（不可作用于 owner，除非先转让） |
| DELETE | `/workspaces/:wsId/members/:userId` | 移除成员（owner/admin；不能移除 owner） |
| POST | `/workspaces/:wsId/transfer` | `{ toUserId }` 转让 owner（owner） |

工作空间级路由统一鉴权：成员 200/403，语义见 03 §3。

## 4. 页面 pages（全部挂在工作空间下）

| Method | Path | 说明 |
|--------|------|------|
| GET | `/workspaces/:wsId/pages` | 树（非回收站全量）：`[{ id, title, icon, parentId, isTemplate, updatedAt, children[] }]` |
| POST | `/workspaces/:wsId/pages` | `{ title?, icon?, parentId?, templateId? }` → `201 { id, ... }`（templateId 走复制流程 08 §4.4） |
| GET | `/workspaces/:wsId/pages/:pageId` | 元数据 |
| PATCH | `/workspaces/:wsId/pages/:pageId` | `{ icon?, title? }`（title 仅作乐观展示的即时回填；服务端以 Y.Doc 提取为准，见 08 §3.3 注意） |
| DELETE | `/workspaces/:wsId/pages/:pageId` | 移入回收站（204） |
| POST | `/workspaces/:wsId/pages/:pageId/restore` | 恢复（含子树） |
| DELETE | `/workspaces/:wsId/pages/:pageId?permanent=true` | 彻底删除（含子树，物理删） |
| GET | `/workspaces/:wsId/trash` | 回收站列表（扁平 + 路径面包屑） |
| PUT | `/workspaces/:wsId/pages/:pageId/favorite` / `DELETE` 同路径 | 收藏/取消 |
| GET | `/workspaces/:wsId/favorites` | 我的收藏 |
| PUT | `/workspaces/:wsId/pages/:pageId/visit` | 记录访问（P1，upsert page_visits） |
| GET | `/workspaces/:wsId/recents` | 最近访问（P1） |

## 5. 内容同步与附件（BlockSuite 专用，二进制）

### 5.1 WS 票据

| Method | Path | 说明 |
|--------|------|------|
| POST | `/ws/ticket` | → `201 { ticket, expiresIn: 30 }`（Phase 2，见 09 §2） |

### 5.2 Y.Doc 增量

| Method | Path | 说明 |
|--------|------|------|
| GET | `/workspaces/:wsId/pages/:pageId/doc?state={base64}` | 客户端 state vector → 差异 update 字节（`octet-stream`）；无内容时 404（05 §4 pull） |
| POST | `/workspaces/:wsId/pages/:pageId/doc` | body = update 字节 → `204`（05 §4 push；写路径语义见 08 §4.2） |

### 5.3 Blob 附件

| Method | Path | 说明 |
|--------|------|------|
| POST | `/workspaces/:wsId/blobs` | multipart `file` → `201 { id, mime, size }` |
| GET | `/blobs/:id` | 内容（长缓存 `immutable`，内容寻址 id 不变） |
| DELETE | `/blobs/:id` | 引用计数为 0 才可删（MVP 由清理任务代劳，端点保留给管理） |

## 6. 错误码全集

格式 `LB_{域}_{原因}`，HTTP 状态码与码一一对应，新增先登记于此：

| code | HTTP | 场景 |
|------|------|------|
| `LB_VALIDATION` | 400 | 请求体/参数校验失败（details 为 zod issues） |
| `LB_UNAUTHORIZED` | 401 | 未登录 / token 过期 |
| `LB_TOKEN_INVALID` | 401 | refresh token 无效或已旋转 |
| `LB_FORBIDDEN` | 403 | 非工作空间成员 / 角色不足 |
| `LB_NOT_FOUND` | 404 | 资源不存在（通用兜底） |
| `LB_PAGE_NOT_FOUND` | 404 | 页面不存在（doc 端点空页专用，客户端据此走本地为准逻辑） |
| `LB_EMAIL_TAKEN` | 409 | 注册邮箱已存在 |
| `LB_TAG_EXISTS` | 409 | 标签重名 |
| `LB_RATE_LIMITED` | 429 | 限流（带 `retryAfter`） |
| `LB_PAYLOAD_TOO_LARGE` | 413 | update/blob 超限 |
| `LB_INTERNAL` | 500 | 未分类异常（只记日志） |

> 历史教训（来自旧文档审计）：错误码语义必须全应用唯一，同一码不得在不同模块表示两种含义。
> 每个 code 需同时登记 zh/en 文案（13 §7），前端按 code 本地化、不展示服务端 message。

## 7. 其余端点

| Method | Path | 说明 |
|--------|------|------|
| GET/POST | `/workspaces/:wsId/tags` | 标签列表 / 新建 `{ name, color }` |
| PATCH/DELETE | `/workspaces/:wsId/tags/:tagId` | 改名/改色 / 删除（page_tags 级联清） |
| PUT/DELETE | `/workspaces/:wsId/pages/:pageId/tags/:tagId` | 打/去标签 |
| GET | `/workspaces/:wsId/pages/:pageId/tags` | 页面标签 |
| GET | `/workspaces/:wsId/search?q=` | 搜索（08 §6）→ `[{ id, title, breadcrumb[], snippet? }]` |
| GET | `/api/health` | 探活（07 §9） |

## 8. 契约共享

- 请求/响应的 zod schema 定义在 `packages/contracts`，服务端 parse、前端复用同一 schema 做表单校验（06 §1）；
- TS 类型从 schema 推导（`z.infer`），**不手写双份 DTO**——旧文档的 DTO/Schema 双轨漂移不允许复现。

## 9. 待细化

- 列表分页参数（P1 启用时定 cursor 编码）；
- 搜索高亮 snippet 的截断规则（前端样式定型后回填）；
- API 文档自动生成：可改用 `@hono/zod-openapi` + `@hono/swagger-ui`，让本文端点表由 `packages/contracts` 的 zod schema 同源生成，消除手写漂移（P1）。
