/**
 * yjs 二进制工具（08 §4 / 10 §5.2）。
 * 边界约定：Y.Doc 实例只在包内创建/销毁，跨包只传 Uint8Array / 纯数据，
 * 保证模块单实例（06 §1.1 红线 1）不依赖宿主的 yjs 去重。
 */
import * as Y from 'yjs';

export { Y };

export function mergeUpdates(updates: Uint8Array[]): Uint8Array {
  return Y.mergeUpdates(updates);
}

/** 用 state vector 从全量状态里取缺失增量（08 §4.1 差分） */
export function diffUpdate(state: Uint8Array, sv: Uint8Array): Uint8Array {
  return Y.diffUpdate(state, sv);
}

export function encodeStateAsUpdate(doc: Y.Doc): Uint8Array {
  return Y.encodeStateAsUpdate(doc);
}

export function encodeStateVector(doc: Y.Doc): Uint8Array {
  return Y.encodeStateVector(doc);
}

export function decodeStateVector(sv: Uint8Array): Map<number, number> {
  return Y.decodeStateVector(sv);
}

/** update 二进制 → state vector 编码（Y.decodeStateVector 只接受 SV 编码，两者不可混用） */
export function stateVectorFromUpdate(update: Uint8Array): Uint8Array {
  const doc = docFromState(update);
  try {
    return Y.encodeStateVector(doc);
  } finally {
    doc.destroy();
  }
}

/** container/inner 均为 state vector 编码 */
export function svContains(containerSv: Uint8Array, innerSv: Uint8Array): boolean {
  const a = Y.decodeStateVector(containerSv);
  const b = Y.decodeStateVector(innerSv);
  for (const [client, clock] of b) {
    if ((a.get(client) ?? 0) < clock) return false;
  }
  return true;
}

export function applyUpdate(doc: Y.Doc, update: Uint8Array): void {
  Y.applyUpdate(doc, update, 'server');
}

/** 全量状态（update 二进制）→ 文档副本（提取元数据等只读用途） */
export function docFromState(state: Uint8Array): Y.Doc {
  const doc = new Y.Doc();
  applyUpdate(doc, state);
  return doc;
}

// ---- base64（10 §5.2 的 state 查询参数）----

export function toBase64(u8: Uint8Array): string {
  return Buffer.from(u8).toString('base64');
}

export function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'));
}
