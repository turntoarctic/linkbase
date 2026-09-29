/**
 * DocCollection 初始化（05 §3/§10）：每工作空间一个 TestWorkspace（0.22.4 实际装配）。
 * - main = BroadcastChannelDocSource（跨标签页即时同步）；shadow = ServerDocSource（持久化）；
 * - blob main = ServerBlobSource；shadow = IndexedDBBlobSource（离线缓存）；
 * - awareness 用 BroadcastChannel（Phase 2 换 ServerAwarenessSource）。
 * 页面 = 根 Y.Doc 的 subdoc（guid = pageId，05 §6），由 DocEngine 按 guid 走同一 DocSource。
 */
import {
  BroadcastChannelAwarenessSource,
  BroadcastChannelDocSource,
  IndexedDBBlobSource,
  type BlobSource,
  type DocSource,
} from '@blocksuite/affine/sync';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { Text, type Doc, type Store } from '@blocksuite/store';
import { ServerDocSource } from './server-doc-source';
import { ServerBlobSource } from './server-blob-source';
import { getStoreSpecs, initEditor } from './specs';

const collections = new Map<string, TestWorkspace>();

export function getCollection(wsId: string): TestWorkspace {
  initEditor();
  let collection = collections.get(wsId);
  if (!collection) {
    const rootGuid = wsId;
    collection = new TestWorkspace({
      id: wsId,
      docSources: {
        main: new BroadcastChannelDocSource() as unknown as DocSource,
        shadows: [new ServerDocSource(wsId, rootGuid)],
      },
      blobSources: {
        main: new ServerBlobSource(wsId) as unknown as BlobSource,
        shadows: [new IndexedDBBlobSource(wsId)],
      },
      awarenessSources: [new BroadcastChannelAwarenessSource(wsId)],
    });
    collection.meta.initialize();
    collections.set(wsId, collection);
  }
  return collection;
}

/** 空页块树初始化（05 §10：page + surface + note + 空段落） */
function initEmptyPage(store: Store, title: string): void {
  const rootId = store.addBlock('affine:page', {});
  store.addBlock('affine:surface', {}, rootId);
  const noteId = store.addBlock('affine:note', {}, rootId);
  if (title) {
    store.addBlock('affine:paragraph', { text: new Text(title) }, noteId);
  } else {
    store.addBlock('affine:paragraph', {}, noteId);
  }
}

/**
 * 打开页面 doc（05 §3）：本地优先；服务端 pull 在后台由 shadow 源完成。
 * 空页（服务端 404）→ 本地初始化块树后由引擎 push 上去。
 */
export async function openPageDoc(
  collection: TestWorkspace,
  pageId: string,
  opts: { title?: string } = {},
): Promise<Store> {
  const doc: Doc = collection.getDoc(pageId) ?? collection.createDoc(pageId);
  if (!doc.loaded) doc.load(); // 同步（05 §10）
  const store = doc.getStore({ extensions: getStoreSpecs() });
  if (!store.root) {
    collection.transact(() => {
      initEmptyPage(store, opts.title ?? '');
    });
  }
  return store;
}

/** 在 Y.Doc 里改标题（真相源；服务端派生缓存随后对齐，08 §5） */
export async function renamePageDoc(
  collection: TestWorkspace,
  pageId: string,
  title: string,
): Promise<void> {
  const store = await openPageDoc(collection, pageId);
  const root = store.root;
  if (!root) return;
  store.transact(() => {
    const titleText = root.props.title as unknown as {
      delete: (i: number, l: number) => void;
      insert: (i: number, s: string) => void;
      length: number;
    };
    if (titleText && typeof titleText.delete === 'function') {
      titleText.delete(0, titleText.length);
      titleText.insert(0, title);
    } else {
      (root.props as Record<string, unknown>).title = new Text(title);
    }
  });
}
