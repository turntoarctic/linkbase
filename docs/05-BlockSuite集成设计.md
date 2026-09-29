# 05 - BlockSuite 集成设计

> 权威文档：BlockSuite 的接入方式、数据源实现、编辑器挂载与扩展路线。API 端点见 10，存储见 08。

## 1. 事实基线

| 项 | 事实 |
|----|------|
| 版本 | **本地 vendor 集成**：源码包位于应用仓库 `packages/blocksuite/`，基线 **0.22.4**（toeverything 官方）；上游克隆 `./blocksuite/` 仅作同步参照 |
| 核心包 | `@blocksuite/affine`（all-in-one，子路径导出 `/store` `/sync` `/schemas` `/blocks/*` `/shared/services` 等）；底层 `@blocksuite/{store,std,global,sync}`（framework） |
| 数据模型 | 每个页面一个 Y.Doc；块树（flavor + props）存于 Y.Doc 内；CRDT 原生 |
| 编辑器 | Web Component `<affine-editor-container>`，`doc` / `pageSpecs` / `edgelessSpecs` 属性；`page` 与 `edgeless` 双模式 |
| 同步抽象 | `DocSource`（pull/push/subscribe）、`BlobSource`、`AwarenessSource` 可插拔，内置 BroadcastChannel（跨标签页）、IndexedDB blob 缓存等实现 |
| 导入导出 | `Transformer` + snapshot 中间件，支持 Markdown/HTML |
| 依赖对齐 | 内部 `yjs@^13.6.21`；我们所有直接依赖 `yjs` 必须同为 `^13` 最新，避免双实例（CRDT 大忌）。Bun `overrides` 钉死，合并前 `bun pm ls yjs` 校验；Vite `optimizeDeps.exclude: ['@blocksuite/*']`（源码消费，见 06 §1.1） |

## 2. 本地源码集成：vendor 进 `packages/blocksuite/`

### 2.1 集成形态

BlockSuite 的源码包**直接放进我们自己的 monorepo**，作为 workspace 本地包使用（不发布、不装 npm 包）——它就是仓库里的一个普通 packages 成员：

```
应用仓库/
  apps/
    web/                      # 依赖 "@blocksuite/affine": "workspace:*"
    server/                   # 依赖 "@linkbase/ydoc": "workspace:*"（纯 yjs 元数据提取，§6）
  packages/
    types/  contracts/  database/  ydoc/ ...  # 自有一等包（ydoc = 纯 yjs 提取，不引 BlockSuite 运行时）
    blocksuite/               # ← vendored（整目录来自上游，改动需登记，§8）
      global/                 # @blocksuite/global
      std/                    # @blocksuite/std
      store/                  # @blocksuite/store
      sync/                   # @blocksuite/sync
      affine/                 # @blocksuite/affine（all-in-one，聚合全部块包）
      affine-blocks/ …        # @blocksuite/affine-block-* / -components / -foundation /
                             #  -model / -rich-text / -shared / data-view / ext-loader /
                             #  gfx / inlines / widgets / fragments
```

```jsonc
// 根 package.json（节选）
"workspaces": [
  "apps/*",
  "packages/*",
  "packages/blocksuite/**"   // vendored 上游包（各子目录自带 package.json 即被识别）
]
```

```jsonc
// apps/web/package.json（节选）
"@blocksuite/affine": "workspace:*",
"yjs": "^13"                 // 必须与 store 的 yjs@^13.6 同大版本，严禁双实例
```

### 2.2 vendor 落地步骤（固化成脚本，禁止手工漂移）

同步源：上游 monorepo 克隆（本仓 `./blocksuite/`，仅作参照，**不进应用仓库**）。迁入范围 = 上游 `packages/framework/**` 与 `packages/affine/**` 下的全部包；**不迁** playground / docs / integration-test（上游开发设施，带自己的构建链）。

`scripts/vendor-blocksuite.mjs`（输入上游克隆路径，输出 `packages/blocksuite/`）做四件事：

1. **拷贝**包目录（保留原包名与 `version` 字段——版本号即同步基线标识）；
2. **fixup tsconfig**：上游各包 tsconfig 的 `extends` 指向其仓库根配置，统一改指向我们提供的 `packages/blocksuite/tsconfig.base.json`（strict + Bundler resolution + DOM lib）；
3. **fixup package.json**：删掉生命周期 scripts（`prepare` 等会在 bun install 时误执行）与 changesets / publishConfig 等发布字段；dependencies 原样保留（包间 `workspace:*` 互链由 Bun 原生解析，lit / yjs 等外部依赖照常安装）；
4. 输出同步报告（迁入了哪些包、基线版本、被跳过的本地补丁文件清单）。

### 2.3 为什么 vendor 而不是 npm / 外挂目录引用

- **可调试**：断点直接进 `packages/blocksuite/` 源码，块编辑器的问题不再靠猜；
- **可改**：上游 bug 或行为不合需求直接改，补丁留痕（§8）；
- **工程干净**：包是仓库一等成员，与自有包同构——没有嵌套 monorepo 的 glob 歧义、构建上下文特殊处理、工具链穿越问题；
- **可读**：0.22 仍在快速演进、文档滞后，API 以手边源码为准；
- 代价：升级要跑同步脚本 + 解冲突 + 全量回归（§8），不追随 patch 级自动更新——接受。

### 2.4 注意事项

- 各包 `exports` 指向 `./src/*.ts`（源码消费，上游 AFFiNE 亦如此），Vite 对 workspace 内 TS 源码正常转译；若出现 CJS/ESM 告警按包处理并记录，不做全局 exclude；
- vendored 包的 devDependencies 会随 install 装上（类型/测试工具），量可控，不清理；
- Bun 不做严苛 `engines` 阻断：上游 `engines: node <23` 是其开发期约束，不约束消费方，`bun install` 照常安装；
- Docker 构建：`packages/` 天然在构建上下文中，无特殊处理（11 §3）。

## 3. DocCollection 初始化（前端）

> 本节是设计草图；0.22.4 实际可运行的装配方式（`DocCollection` → `TestWorkspace` 等差异）见 §10，应用代码以 §10 为准。

每个工作空间一个 `DocCollection`（一个 collection 对应一个空间的全量页面索引与 blob 池）：

```ts
// apps/web/src/features/editor/collection.ts
import { AffineSchemas } from '@blocksuite/affine/schemas';
import { DocCollection, nanoid, Schema } from '@blocksuite/affine/store';
import {
  AwarenessSource,
  BroadcastChannelAwarenessSource,
  BlobSource,
  IndexedDBBlobSource,
  type DocCollectionOptions,
  type DocSource,
} from '@blocksuite/affine/sync';

import { ServerDocSource } from './server-doc-source';
import { ServerAwarenessSource } from './server-awareness-source'; // Phase 2，MVP 先用 BroadcastChannel
import { ServerBlobSource } from './server-blob-source';

export function createWorkspaceCollection(workspaceId: string): DocCollection {
  const schema = new Schema();
  schema.register(AffineSchemas);

  const mainDocSource = new ServerDocSource(workspaceId); // §4
  const idbBlob = new IndexedDBBlobSource(workspaceId);   // 本地附件缓存

  const options: DocCollectionOptions = {
    id: workspaceId,
    idGenerator: nanoid,
    docSources: {
      main: new BroadcastChannelDocSourceLocal(), // 跨标签页广播（内置 BroadcastChannelDocSource）
      shadows: [mainDocSource],                    // 服务端是影子源：本地先行，后台同步
    },
    blobSources: { main: new ServerBlobSource(workspaceId), shadows: [idbBlob] },
    awarenessSources: [
      new BroadcastChannelAwarenessSource(workspaceId),
      // Phase 2: new ServerAwarenessSource(workspaceId)
    ],
  };

  const collection = new DocCollection(options);
  collection.start();
  return collection;
}
```

> 主/影（main/shadow）语义按 BlockSuite 同步引擎的 main-first 策略使用：**本地/跨标签页为主源保证即时打开，服务端为影子源负责持久与跨设备**。源码中 `framework/sync/src/doc/engine.ts` 是该引擎实现，行为存疑时读它。

页面打开流程：

```ts
const doc = collection.getDoc(pageId) ?? collection.createDoc(pageId);
if (!doc.loaded) await doc.load();
editor.doc = doc.getStore();
```

## 4. ServerDocSource（同步核心）

`DocSource` 接口（源码 `framework/sync/src/doc/source.ts`）：`pull(docId, stateVector)` / `push(docId, update)` / `subscribe(cb, disconnect)`。实现映射到 10 §5 的端点：

```ts
export class ServerDocSource implements DocSource {
  name = 'linkbase-server';

  async pull(docId: string, state: Uint8Array) {
    const sv = toBase64(state); // Y.encodeStateVector 的结果
    const res = await fetch(`/api/workspaces/${wsId}/pages/${docId}/doc?state=${sv}`);
    if (res.status === 404) return null;            // 服务端无此页 → 本地为准（新建页场景）
    const missing = new Uint8Array(await res.arrayBuffer());
    return missing.byteLength ? { data: missing } : null; // 无缺失返回 null
  }

  async push(docId: string, data: Uint8Array) {
    await fetch(`/api/workspaces/${wsId}/pages/${docId}/doc`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: data, // Yjs update 二进制
    });
  }

  async subscribe(cb: (docId: string, data: Uint8Array) => void, disconnect: (reason: string) => void) {
    // Phase 1（MVP）：返回空退订函数即可——单人编辑无服务端推送需求；
    // Phase 2：挂 WebSocket 房间，收到 update 消息即 cb(docId, update)。见 09。
    return () => {};
  }
}
```

行为要点：

- `pull` 的 `state` 是本端 state vector，服务端 diff 后只回缺失部分（服务端实现见 08 §4）；
- `push` 失败由引擎按源码内建策略重试；我们额外在 `push` 4xx（非 401/429）时告警——内容被拒按bug 处理；
- 401 交给全局 fetch 拦截器做 token 刷新重放（06 §4）。

### ServerBlobSource

实现 `BlobSource` 接口（`get`/`set`/`delete`/`list`），对接 10 §5.3：`set` = `POST /api/workspaces/:ws/blobs`（multipart，返回 blob id），`get` = `/api/blobs/:id`（永久公开读，图片直接进 `<img src>`）。`IndexedDBBlobSource` 作为 shadow 提供离线缓存。

## 5. 编辑器挂载（React）

React 19 对自定义元素原生友好，ref 直取：

```tsx
// apps/web/src/features/editor/editor-view.tsx
import { useEffect, useRef } from 'react';
// 自定义元素注册发生在构建 specs（ViewExtensionManager）时，无独立 effects 副作用入口（§10）

export function EditorView({ pageId }: { pageId: string }) {
  const host = useRef<HTMLElement>(null);

  useEffect(() => {
    const editor = host.current as unknown as
      import('@blocksuite/affine/foundation').AffineEditorContainer;
    // 实际以 @blocksuite/affine 导出的容器类型为准；doc 装配流程见 §3
    return () => { /* editor 清理 */ };
  }, [pageId]);

  return <affine-editor-container ref={host} class="editor-host" />;
}
```

约定：

1. 自定义元素注册随 `initEditor()`（构建 specs）完成一次，无需单独的 effects 副作用导入（0.22.4 该入口为纯类型，见 §10）；
2. 编辑器实例放 React 外部（`useRef` + 不受控），React 只负责容器与页面切换；**块状态一律不进 React state**（06 §3 红线）；
3. `pageSpecs`/`edgelessSpecs` 由 `ViewExtensionManager(getInternalViewExtensions()).get('page'|'edgeless')` 构建；自定义块（P2+）通过向 specs 追加扩展实现，不动上游包；
4. 页面 title 编辑用 BlockSuite 自带 doc title 区域，不自己造输入框。

## 6. 服务端元数据提取（标题/树/搜索文本）

`pages.title`、父子关系、正文纯文本都是 **Y.Doc 的派生缓存**（08 §5）。提取发生在服务端：

- 触发：快照合并任务（08 §4.3）完成后，以及 doc push 后的异步对齐（不阻塞写路径，08 §4.2 的异步语义）；
- 写回：`pages.title` / `pages.text` / `pages.parent_id`（引用块指向的子页以本页为父），搜索索引随之更新（08 §6）；
- 前端不等它：列表与树用乐观值（前端已知 title），服务端缓存异步对齐，其他设备/搜索最终一致。

> **Phase 0 验证结论（2026-09-22，T0.4）**：采用**方案二——纯 yjs 遍历**，落地为共享包 `packages/ydoc`（服务端不引入 BlockSuite 运行时，零 DOM 依赖）。交叉验证：单测用 `@blocksuite/store` headless（`TestWorkspace` + `getStore().addBlock()`）生成真值文档，纯 yjs 提取器读取比对，title/text/refIds 一致。
>
> 提取依据的结构事实（vendored 0.22.4 源码核对）：页面内容是根 Y.Doc 的 subdoc（`rootDoc.getMap('spaces').get(pageId)`，guid=pageId）；块存于 `subdoc.getMap('blocks')`，块键 `sys:id` / `sys:flavour` / `sys:version` / `sys:children`(Y.Array) / `prop:*`；标题 = `affine:page` 根块 `prop:title`（Y.Text）；正文 = `affine:paragraph|list|code` 等的 `prop:text`；子页面与引用 = `affine:embed-synced-doc|embed-linked-doc` 的 `prop:pageId`。

## 7. 模板与导入导出

- **模板建页**（02 §3）：模板页本身是普通页面（`is_template`）；从模板建页 = 服务端复制模板的当前快照为新页面（updates 复制 + 新 page id 重映射，见 08 §4.4）；
- **Markdown 导入导出**（P1）：用 `Transformer` + markdown 中间件，导入在建页时执行（md → snapshot → Y.Doc），导出在页面菜单中执行（Y.Doc → snapshot → md 下载）；
- 模板内置内容随应用发布（seed），不在运行时从远程拉。

## 8. vendored 源码管理与上游同步

| 场景 | 做法 |
|------|------|
| 日常改动 / 修 bug | 直接改 `packages/blocksuite/` 内源码；在 91 §5 登记文件 + 原因 + 最小 diff |
| 上游升级 | 更新上游克隆 → 重跑 `scripts/vendor-blocksuite.mjs` 同步 → 解决与本地补丁的冲突（脚本报告会列出被本地改动过的文件）→ **全量回归**（typecheck + 单测 + e2e 编辑器用例）→ 通过后在 91 §6 记录新基线 |
| 大版本不兼容 | 停留当前基线，升级事项进 91 待办 |
| 补丁回流 | 本地补丁条件允许时向上游提 PR；合入后再同步时本地 diff 即消失 |

## 9. 扩展块路线（P2+，概要）

> Database 块（data-view）是**内置块**（随 AffineSchemas 注册，§1），不属于本节的自定义块路线：P0 的 T1.8 只做集成验证与使用约定（02 §2），具体视图能力以 vendored 源码实际支持为准。

自定义块 = 上游 `ext-loader` 扩展机制（ExtensionType 三件套：block spec 的 model/view/spec + 服务）。路线：

1. **P2 前置练习**：做一个最简自定义块（如「页面属性」块）走通机制；
2. **API 块**：method/path/参数表/响应示例的结构化块，props 存 JSON，视图自绘；
3. **Mock 块 / 测试用例块**：依赖 API 块，P2/P3 按需立项，届时新立文档（不复用 archive/11-13 的表结构，但复用其领域语义）。

## 10. 已验证的 0.22.4 API 事实（Phase 0 实施核对）

文档草图与 vendored 0.22.4 源码的差异，以下为**实际可用**的装配方式（应用代码已按此落地）：

| 草图 | 0.22.4 实际 |
|------|------------|
| `new DocCollection(options)` | `new TestWorkspace(options)`（`@blocksuite/affine/store/test` 导出，实现 `Workspace` 接口；`DocCollectionOptions`/`docSources`/`shadows` 语义一致，官方 playground 同款装配） |
| 无 | 需注入 `collection.storeExtensions = new StoreExtensionManager(getInternalStoreExtensions()).get('store')`（`@blocksuite/affine/ext-loader` + `@blocksuite/affine/extensions/store`） |
| `import '@blocksuite/affine/effects'` 注册自定义元素 | **该入口是纯类型模块，无运行时副作用**。实际注册链：`new ViewExtensionManager(getInternalViewExtensions()).get('page'/'edgeless')` 构建 specs 时触发各 provider 的 `effect()` → `customElements.define` |
| `<affine-editor-container>` 由框架提供 | **框架不再自带编辑器容器**（playground 用 integration-test 的测试容器，AFFiNE 自带应用版）。应用级容器落地于 `apps/web/src/features/editor/affine-editor-container.ts`（按上游 `TestAffineEditorContainer` 同构适配：`BlockStdScope` + `<doc-title>` + page/edgeless 双模式） |
| `collection.getDoc / createDoc / doc.load()` | 一致；页面 subdoc 位于 `rootDoc.getMap('spaces')`，`doc.load()` 为同步（initFn 仅首次 ready 前执行）。新页空块树初始化（page+surface+note+空段落）在 `collection.ts#openDoc` 显式处理 |
| Transformer `docCRUD` | `collection.blobSync` 与 `createDoc(id).getStore({id})` 组合，与草图一致 |
| 编辑器内置文案多语言 | **无 i18n 层**：vendored 0.22.4 无 i18n provider/locale 资源，菜单等为硬编码英文（如 `affine-widgets/slash-menu/src/config.ts` 的 `name: 'Today'/'Delete'`）。本地化策略见 13 §5 |

## 11. 待细化

- §4 `subscribe` 的 WebSocket 消息封帧（Phase 2 落 09 时定）；
- Edgeless 模式的白板数据（surface block）是否需要额外 blob 存储（P1 打磨时确认）；
- BlockSuite 内置 UI 的 i18n 桥接清单（哪些可经扩展覆盖、哪些须改源码，13 §5 / 90 T0.9）。
