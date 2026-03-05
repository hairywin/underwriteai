const memoryCache = new Map<string, { expiresAt: number; value: unknown }>();

export type CacheStore = {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttlMs: number): void;
};

function getStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export const localCache: CacheStore = {
  get<T>(key: string): T | null {
    const now = Date.now();
    const storage = getStorage();
    const mem = memoryCache.get(key);
    if (mem && mem.expiresAt > now) return mem.value as T;

    if (!storage) return null;
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as { expiresAt: number; value: T };
      if (parsed.expiresAt <= now) {
        storage.removeItem(key);
        return null;
      }
      memoryCache.set(key, { expiresAt: parsed.expiresAt, value: parsed.value });
      return parsed.value;
    } catch {
      storage.removeItem(key);
      return null;
    }
  },
  set<T>(key: string, value: T, ttlMs: number) {
    const expiresAt = Date.now() + ttlMs;
    memoryCache.set(key, { expiresAt, value });
    const storage = getStorage();
    if (!storage) return;
    try {
      storage.setItem(key, JSON.stringify({ expiresAt, value }));
    } catch {
      // ignore quota/storage errors
    }
  },
};

export function stableHash(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
