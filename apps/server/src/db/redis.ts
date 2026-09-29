/**
 * Redis 访问（07 §2/§6）：只放会话/邀请/WS 票据/限流计数，绝不承载业务真相。
 * Bun 原生 RedisClient（send 接口最小收窄）；无 REDIS_URL 时进程内存降级（仅开发，07 §3）。
 */

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  /** INCR + 首次 EXPIRE（固定窗口限流用） */
  incr(key: string, ttlSeconds: number): Promise<number>;
  ping(): Promise<boolean>;
  close(): void;
}

type RedisLike = {
  send(command: string, args: string[]): Promise<unknown>;
  close(): Promise<void>;
};

function openRedis(url: string): RedisLike {
  const bun = (globalThis as unknown as { Bun?: { RedisClient?: new (url: string) => RedisLike } }).Bun;
  if (!bun?.RedisClient) {
    throw new Error('Bun.RedisClient unavailable');
  }
  return new bun.RedisClient(url);
}

export function createRedisKV(url: string): KV {
  const client = openRedis(url);
  const S = (n: number) => String(n);
  return {
    async get(key) {
      return (await client.send('GET', [key])) as string | null;
    },
    async set(key, value, ttlSeconds) {
      await client.send('SET', [key, value, 'EX', S(ttlSeconds)]);
    },
    async del(key) {
      await client.send('DEL', [key]);
    },
    async incr(key, ttlSeconds) {
      const n = (await client.send('INCR', [key])) as number;
      if (n === 1) {
        await client.send('EXPIRE', [key, S(ttlSeconds)]);
      }
      return n;
    },
    async ping() {
      try {
        return (await client.send('PING', [])) === 'PONG';
      } catch {
        return false;
      }
    },
    close() {
      void client.close();
    },
  };
}

/** 内存降级实现：Map + 过期时间戳，惰性清理（仅开发/测试） */
export function createMemoryKV(): KV {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  const alive = (key: string) => {
    const e = store.get(key);
    if (!e) return false;
    if (e.expiresAt !== null && e.expiresAt < Date.now()) {
      store.delete(key);
      return false;
    }
    return true;
  };
  return {
    async get(key) {
      return alive(key) ? (store.get(key)!.value ?? null) : null;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, { value, expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null });
    },
    async del(key) {
      store.delete(key);
    },
    async incr(key, ttlSeconds) {
      const cur = alive(key) ? Number(store.get(key)!.value) || 0 : 0;
      const next = cur + 1;
      const existing = store.get(key);
      const expiresAt = existing && alive(key) && existing.expiresAt !== null
        ? existing.expiresAt
        : Date.now() + ttlSeconds * 1000;
      store.set(key, { value: String(next), expiresAt });
      return next;
    },
    async ping() {
      return true;
    },
    close() {
      store.clear();
    },
  };
}

export function createKV(redisUrl?: string): KV {
  if (redisUrl) {
    try {
      return createRedisKV(redisUrl);
    } catch (err) {
      console.error('[redis] unavailable, falling back to in-memory (dev only)', err);
    }
  }
  return createMemoryKV();
}
