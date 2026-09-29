import { eq } from 'drizzle-orm';
import { blobs } from '@linkbase/database';
import { AppError } from '../lib/errors';
import type { AppDeps } from '../types';

const MAX_BLOB_BYTES = 25 * 1024 * 1024; // 10 §1

/** 内容寻址 id：sha256 前 32 hex（08 §3.5） */
async function contentId(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as ArrayBuffer);
  return Buffer.from(digest).toString('hex').slice(0, 32);
}

export async function putBlob(
  deps: AppDeps,
  userId: string,
  wsId: string,
  file: File,
): Promise<{ id: string; mime: string; size: number }> {
  if (file.size > MAX_BLOB_BYTES) {
    throw new AppError('LB_PAYLOAD_TOO_LARGE', 413, 'blob exceeds 25MB');
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const id = await contentId(data);
  const mime = file.type || 'application/octet-stream';
  await deps.db
    .insert(blobs)
    .values({ id, workspaceId: wsId, mime, size: file.size, data, createdBy: userId })
    .onConflictDoNothing(); // 内容寻址：同内容幂等
  return { id, mime, size: file.size };
}

export async function getBlob(deps: AppDeps, id: string) {
  const rows = await deps.db.select().from(blobs).where(eq(blobs.id, id)).limit(1);
  const blob = rows[0];
  if (!blob) return null;
  return {
    data: toU8(blob.data),
    mime: blob.mime,
    immutable: true as const,
  };
}

/** MVP：直接物理删；引用计数清理由 trash-cleanup 任务代劳（10 §5.3/08 §8） */
export async function deleteBlob(deps: AppDeps, id: string): Promise<boolean> {
  const rows = await deps.db.delete(blobs).where(eq(blobs.id, id)).returning({ id: blobs.id });
  return rows.length > 0;
}

function toU8(v: Uint8Array): Uint8Array {
  return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
}
