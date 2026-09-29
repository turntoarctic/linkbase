import { describe, expect, test } from 'bun:test';
import {
  type PageMeta,
  Y,
  decodeStateVector,
  diffUpdate,
  docFromState,
  encodeStateAsUpdate,
  encodeStateVector,
  extractMetaFromState,
  extractPageMeta,
  fromBase64,
  mergeUpdates,
  stateVectorFromUpdate,
  svContains,
  toBase64,
} from './index';

/** 构造一个符合 05 §6 结构约定的页面 doc */
function buildPageDoc(edit: (doc: Y.Doc) => void): Y.Doc {
  const doc = new Y.Doc();
  edit(doc);
  return doc;
}

function addBlock(doc: Y.Doc, flavour: string, props: Record<string, unknown>): string {
  const blocks = doc.getMap('blocks');
  const id = `b-${Math.random().toString(36).slice(2, 9)}`;
  const block = blocks.set(id, new Y.Map()) as Y.Map<unknown>;
  block.set('sys:id', id);
  block.set('sys:flavour', flavour);
  for (const [k, v] of Object.entries(props)) block.set(`prop:${k}`, v);
  return id;
}

describe('yutils: merge / diff / state vector', () => {
  test('client with old SV gets only the delta and converges', () => {
    const server = buildPageDoc((doc) => {
      addBlock(doc, 'affine:paragraph', { text: new Y.Text('第一版') });
    });
    const firstState = encodeStateAsUpdate(server);
    const clientSv = encodeStateVector(server);

    // 服务端继续演进（第二轮编辑）
    addBlock(server, 'affine:paragraph', { text: new Y.Text('第二段') });
    const fullState = encodeStateAsUpdate(server);

    // 客户端 pull：服务端全量状态 − 客户端 SV = 差异
    const delta = diffUpdate(fullState, clientSv);
    expect(delta.length).toBeGreaterThan(0);

    // 客户端已有第一轮状态，应用差异后与服务端一致
    const client = new Y.Doc();
    Y.applyUpdate(client, firstState);
    Y.applyUpdate(client, delta);
    expect(client.getMap('blocks').size).toBe(server.getMap('blocks').size);
  });

  test('empty diff when client is up to date', () => {
    const doc = buildPageDoc((d) => addBlock(d, 'affine:paragraph', { text: new Y.Text('hi') }));
    const state = encodeStateAsUpdate(doc);
    const sv = encodeStateVector(doc);
    expect(svContains(sv, sv)).toBe(true);
    // 空差异是协议头的 2 字节空 update（state vector 为空），客户端应用后无变化
    const diff = diffUpdate(state, sv);
    expect(decodeStateVector(diff).size).toBe(0);
  });

  test('mergeUpdates of independent updates equals full state', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    a.getText('t').insert(0, 'hello');
    const ua = Y.encodeStateAsUpdate(a);
    b.getText('t').insert(0, 'world');
    const ub = Y.encodeStateAsUpdate(b);

    const merged = new Y.Doc();
    Y.applyUpdate(merged, mergeUpdates([ua, ub]));
    // 并发同位置插入的先后由 clientID 决定，两种顺序都是合法 CRDT 结果
    expect(merged.getText('t').toString()).toMatch(/^(helloworld|worldhello)$/);
  });

  test('base64 roundtrip for state vector', () => {
    const doc = new Y.Doc();
    doc.getMap('blocks').set('k', new Y.Map());
    const sv = encodeStateVector(doc);
    const back = fromBase64(toBase64(sv));
    expect(back).toEqual(sv);
    expect(decodeStateVector(back).size).toBe(1);
  });

  test('stateVectorFromUpdate：update 二进制可正确导出 SV（回归：update ≠ SV 编码）', () => {
    const doc = buildPageDoc((d) => addBlock(d, 'affine:paragraph', { text: new Y.Text('hi') }));
    const state = encodeStateAsUpdate(doc);
    const sv = encodeStateVector(doc);
    const fromState = stateVectorFromUpdate(state);
    expect(svContains(fromState, sv)).toBe(true);
    expect(svContains(sv, fromState)).toBe(true);
  });
});

describe('extractPageMeta（05 §6 结构约定）', () => {
  test('title / text / subPageIds / refPageIds', () => {
    const doc = buildPageDoc((d) => {
      addBlock(d, 'affine:page', { title: new Y.Text('会议纪要') });
      addBlock(d, 'affine:paragraph', { text: new Y.Text('第一段') });
      addBlock(d, 'affine:list', { text: new Y.Text('待办项') });
      addBlock(d, 'affine:embed-synced-doc', { pageId: 'child-1' });
      addBlock(d, 'affine:embed-linked-doc', { pageId: 'ref-9' });
    });
    const meta = extractPageMeta(doc);
    expect(meta.title).toBe('会议纪要');
    expect(meta.text).toBe('第一段\n待办项');
    expect(meta.subPageIds).toEqual(['child-1']);
    expect(meta.refPageIds).toEqual(['ref-9']);
  });

  test('extractMetaFromState works from merged binary state', () => {
    const doc = buildPageDoc((d) => {
      addBlock(d, 'affine:page', { title: new Y.Text('PRD') });
      addBlock(d, 'affine:paragraph', { text: new Y.Text('正文内容') });
    });
    const state = encodeStateAsUpdate(doc);
    const meta: PageMeta = extractMetaFromState(state);
    expect(meta.title).toBe('PRD');
    expect(meta.text).toContain('正文内容');
    // 从二进制重建的 doc 应与原 doc 等价
    const rebuilt = docFromState(state);
    expect(extractPageMeta(rebuilt).title).toBe('PRD');
  });
});
