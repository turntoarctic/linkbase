/**
 * ServerBlobSource（05 §4）：BlobSource 接口 → 10 §5.3 端点。
 * - set(key, blob) → multipart 上传，返回服务端内容寻址 id；
 * - get(key) → /api/blobs/:key（长缓存，immutable）；
 * - list：MVP 无列表端点，返回空（块内引用以 key 为准，不依赖 list）。
 */
import type { BlobSource } from '@blocksuite/affine/sync';
import { useAuthStore } from '@/stores/auth';

export class ServerBlobSource implements BlobSource {
  name = 'linkbase-server';
  readonly = false;

  constructor(private readonly wsId: string) {}

  async get(key: string): Promise<Blob | null> {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`/api/blobs/${key}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) return null;
    return await res.blob();
  }

  async set(_key: string, value: Blob): Promise<string> {
    const token = useAuthStore.getState().accessToken;
    const form = new FormData();
    form.append('file', value, 'blob');
    const res = await fetch(`/api/workspaces/${this.wsId}/blobs`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    });
    if (!res.ok) throw new Error(`blob upload failed: ${res.status}`);
    const { id } = (await res.json()) as { id: string };
    return id;
  }

  async delete(key: string): Promise<void> {
    const token = useAuthStore.getState().accessToken;
    await fetch(`/api/blobs/${key}`, {
      method: 'DELETE',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  }

  async list(): Promise<string[]> {
    return [];
  }
}
