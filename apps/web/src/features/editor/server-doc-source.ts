/**
 * ServerDocSource（05 §4）：DocSource 接口 → 10 §5.2 端点。
 * - pull(state vector) → 服务端差分；404 = 服务端无此页 → 本地为准（新建页）；
 * - push = Yjs update 二进制；
 * - 根 doc（guid = workspaceId）的 meta 同步对服务端无意义（元数据在 PG），直接短路；
 * - Phase 1（MVP）subscribe 返回空退订（单人编辑无服务端推送）；Phase 2 换 WS 房间（09）。
 */
import type { DocSource } from '@blocksuite/affine/sync';
import { apiBytes, apiVoid } from '@/lib/api';

/** 分块转 base64：直接 spread 进 String.fromCharCode 超 ~65KB 会爆栈 */
function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export class ServerDocSource implements DocSource {
  name = 'linkbase-server';

  constructor(
    private readonly wsId: string,
    private readonly rootGuid: string,
  ) {}

  private isRoot(docId: string): boolean {
    return docId === this.rootGuid;
  }

  async pull(docId: string, state: Uint8Array) {
    if (this.isRoot(docId)) return null;
    const sv = encodeURIComponent(toBase64(state));
    const missing = await apiBytes(
      `/workspaces/${this.wsId}/pages/${docId}/doc?state=${sv}`,
    );
    if (missing === null) return null; // 404：服务端无内容 → 本地为准
    return missing.byteLength ? { data: missing } : null;
  }

  async push(docId: string, data: Uint8Array) {
    if (this.isRoot(docId)) return; // 根 doc 的 meta 不落服务端
    await apiVoid(`/workspaces/${this.wsId}/pages/${docId}/doc`, {
      method: 'POST',
      body: data,
    });
  }

  subscribe() {
    // Phase 2：WS 房间推送 → cb(docId, update)（09）
    return () => {};
  }
}
