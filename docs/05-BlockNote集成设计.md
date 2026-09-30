# 05 - BlockNote 集成设计（完整形态）

> 权威文档：编辑器内核（BlockNote）的能力清单、schema 组成、挂载与自动保存、派生提取、协作演进。
> 以官方文档为准：https://www.blocknotejs.org/docs 。API 端点见 10，存储见 08。
> 历史注：原 BlockSuite（vendored 0.22.4 + yjs）2026-09-30 退役；同日先试 Editor.js，随即升级为 **BlockNote 0.55.x**（ProseMirror/TipTap 底座、React 组件、UI 全内建）。迁移记录见 91 §6。

## 1. 事实基线

| 项 | 事实 |
|----|------|
| 内核 | `@blocknote/{core,react,mantine}` **0.55.x**（npm 锁 `bun.lock`；**三包同版本升级**） |
| 官方扩展 | `@blocknote/code-block`（代码高亮）+ `@blocknote/xl-multi-column`（多栏）+ `@blocknote/math-block`（数学公式）——同版本 |
| 数据模型 | 文档 = **BlockNote 块数组 JSON**（`[{ id, type, props, content, children }]`），存 `pages.content JSONB`（08 §3.3）——**真相即此列** |
| 挂载 | `useCreateBlockNote` + `<BlockNoteView>`（hook 持有实例，块状态不复制进 React state，06 §2）；编辑器 chunk 懒加载（gz ≈ 460KB，含 Shiki/KaTeX） |
| 本地化 | **官方 zh/en 字典内建**（`@blocknote/core/locales`），编辑器 UI 随 i18next 语言切换（13 §5） |

## 2. 能力清单（默认 schema + 官方扩展，全部可用）

### 2.1 块类型

| 类别 | 块 | 说明 |
|------|----|------|
| 排版 | `paragraph` | 正文 |
| | `heading` (1–6) | `isToggleable` 可折叠标题（toggle heading） |
| | `quote` | 引用 |
| | `divider` | 分割线（空行 `---` 快捷） |
| 列表 | `bulletListItem` / `numberedListItem` / `checkListItem` | 无限嵌套 |
| 代码 | `codeBlock` | **语法高亮**（`@blocknote/code-block`，Shiki 多语言） |
| 表格 | `table` | **完整能力已开**（`tables` 选项）：表头行/列、单元格底色/字色、拆分合并单元格、行列增删手柄 |
| 嵌入 | `image` / `video` / `audio` / `file` | 经 `uploadFile` 走 blobs（§5） |
| 多栏 | `columnList` / `column` | `@blocknote/xl-multi-column`；侧栏拖拽跨栏 |
| 数学 | `mathBlock` + 行内 `math` | `@blocknote/math-block`，LaTeX → KaTeX 渲染 |

### 2.2 行内内容与样式

- 行内：`text`（富文本）、`link`（超链接）、`math`（行内公式）；
- 样式：bold / italic / underline / strike / inlineCode / textColor / backgroundColor——格式工具栏全量操作。

### 2.3 内建 UI（零装配）

slash 菜单（`/`）、格式工具栏（含移动端键盘上方适配）、侧栏菜单（`+` 加块 / 拖拽手柄 / 块菜单）、文件面板（选文件或贴 URL）、表格手柄、颜色选择器。**定制点**：slash 菜单项合并多栏与数学项（`SuggestionMenuController` + `combineByGroup`，见 `editor-view.tsx`）。

## 3. Schema 组成（`features/editor/schema.ts`）

默认 schema 全量 + 三官方扩展，单点定义：

```ts
export const schema = withMultiColumn(
  BlockNoteSchema.create().extend({
    blockSpecs: {
      codeBlock: createCodeBlockSpec(codeBlockOptions),  // 代码高亮语言集
      mathBlock: createReactMathBlockSpec(),             // LaTeX 块
    },
    inlineContentSpecs: { math: createReactInlineMathSpec() }, // 行内公式
  }),
);
```

扩展编辑器能力（自定义块等）= 改这里；禁止散落在组件里。图片等文件上传经 `useCreateBlockNote({ uploadFile })`，不在 schema 层。

## 4. 挂载与自动保存（`features/editor/editor-view.tsx`）

- `useCreateBlockNote({ schema, initialContent, extensions: [syntaxHighlighter], dropCursor: multiColumnDropCursor, dictionary, uploadFile })`；deps 含语言键——**语言切换重建编辑器**（字典跟随）；
- **自动保存**：`onChange` 防抖 800ms → `JSON.stringify(editor.document)` → PUT /doc；卸载（切页/登出）前 flush；
- 切页 = `key={pageId}` 重建实例；
- 初始数据：AppShell GET /doc，404 视为空文档（`[]`）。

## 5. 图片与 blob

- `uploadFile` → `POST /workspaces/:wsId/blobs`（multipart，sha256 内容寻址，10 §5.3）→ 返回 `/api/blobs/{id}`，image/video/audio/file 四类块共用；
- **GET /blobs/:id 免鉴权**：id 为 sha256 前 32 hex（128-bit 不可猜），且 `<img>` 无法携带 Bearer 头；代价 = 凭 URL 可读单张图（公链语义）；PUT/DELETE 仍鉴权（风险登记 91 §4，收紧路径 = HMAC 签名 URL）。

## 6. 派生提取（server `lib/editor-meta.ts`）

- 输入：PUT 到达的块数组；输出：正文纯文本（`pages.text`，截断 20000 字符，08 §6）；
- 形状事实：`block.content` = `StyledText[]`（`{type:'text', text}`）、`link`（`content` 内嵌文本）、`tableContent`（`rows[].cells[]`）、或 undefined（嵌入类块）；嵌套子块在 `block.children`（含 column 内子块）。递归收集 `text`/`content`/`cells`/`children`；**未知形状跳过**——派生宽松，绝不阻塞写路径；
- **title 不从内容派生**：PATCH 是 `pages.title` 唯一写入口（编辑器不持有标题）。

## 7. 许可与演进

- **许可**：core/react/mantine/code-block/math-block 为 MPL-2.0 系常规开源；**`@blocknote/xl-multi-column` 为 copyleft（xl- 系）**，闭源商用需 Business 订阅——本项目开源自托管，可接受；若未来闭源发行需评估移除多栏（schema 层单点，删除成本低）；
- **协作演进**：BlockNote 原生协作模式（`useCreateBlockNote({ collaboration: { provider, user, fragment } })`，yjs）。现 JSON 整体读写（多标签页并发 = last-write-wins）；需求成立时启用 09 的 WS 房间 + 票据设计并切换 collaboration 模式，**现在不做预留代码**；
- **可选未装**：Mermaid 图表块（官方 diagram-block，mermaid 依赖过重，按需再加）；DOCX/PDF/ODT 导出器（xl- 系，P2 导出功能立项时评估）；
- **包体优化**（如需）：`@blocknote/code-block` 默认 Shiki 全语言，官方提供 `shiki-codegen` 按语言子集裁剪；先观察实际体积再决定。
