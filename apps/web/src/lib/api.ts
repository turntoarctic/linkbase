import { errorCodes, type ErrorCode } from '@linkbase/contracts';
import { useAuthStore } from '@/stores/auth';

/** 带稳定错误码的 API 异常（10 §1/§6）：message 仅兜底，UI 按 code 走 i18n */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function raw(path: string, init: RequestInit, token: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const isFormData = init.body instanceof FormData;
  const isBinary = init.body instanceof ArrayBuffer || init.body instanceof Uint8Array;
  if (init.body && !isFormData && !isBinary) headers.set('Content-Type', 'application/json');
  return await fetch(`/api${path}`, { ...init, headers });
}

async function tryRefresh(): Promise<boolean> {
  const { refreshToken, setTokens, clear } = useAuthStore.getState();
  if (!refreshToken) return false;
  const res = await fetch('/api/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    clear();
    return false;
  }
  const pair = (await res.json()) as { accessToken: string; refreshToken: string };
  setTokens(pair.accessToken, pair.refreshToken);
  return true;
}

async function toApiError(res: Response): Promise<ApiError> {
  let code: string = errorCodes.INTERNAL;
  let message = res.statusText;
  let details: unknown;
  try {
    const body = (await res.json()) as { error?: { code?: string; message?: string; details?: unknown } };
    code = body.error?.code ?? code;
    message = body.error?.message ?? message;
    details = body.error?.details;
  } catch {
    // 非 JSON 错误体
  }
  return new ApiError(code, res.status, message, details);
}

/** JSON 请求：401 自动刷新重试一次（07 §5 无感刷新） */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  let res = await raw(path, init, accessToken);
  if (res.status === 401 && accessToken) {
    if (await tryRefresh()) {
      res = await raw(path, init, useAuthStore.getState().accessToken);
    }
  }
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** 二进制：Y.Doc 增量（10 §5.2） */
export async function apiBytes(path: string, init: RequestInit = {}): Promise<Uint8Array | null> {
  const { accessToken } = useAuthStore.getState();
  const res = await raw(path, init, accessToken);
  if (res.status === 404) return null; // 空页 → 客户端以本地为准（08 §4.1）
  if (!res.ok) throw await toApiError(res);
  return new Uint8Array(await res.arrayBuffer());
}

export async function apiVoid(path: string, init: RequestInit = {}): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  let res = await raw(path, init, accessToken);
  if (res.status === 401 && accessToken) {
    if (await tryRefresh()) {
      res = await raw(path, init, useAuthStore.getState().accessToken);
    }
  }
  if (!res.ok) throw await toApiError(res);
}

export const jsonBody = (value: unknown): RequestInit => ({ body: JSON.stringify(value) });
