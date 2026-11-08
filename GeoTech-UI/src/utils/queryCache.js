/**
 * Small in-memory query cache for reference data (projects, vendors, users).
 *
 * The app re-mounts pickers and forms frequently; without a cache every mount
 * re-downloads the same lists. Entries are keyed by namespace + normalized
 * params, expire after a short TTL, and de-duplicate concurrent requests.
 *
 * Writes invalidate the matching namespace so freshly created/updated records
 * show up immediately.
 */

const DEFAULT_TTL = 60_000;
const store = new Map();

const normalizeValue = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        const normalized = normalizeValue(value[key]);
        if (normalized !== undefined) acc[key] = normalized;
        return acc;
      }, {});
  }
  return value;
};

/** Build a stable cache key from a namespace and request params. */
export function queryKey(namespace, params) {
  const normalized = normalizeValue(params);
  if (!normalized || Object.keys(normalized).length === 0) return namespace;
  return `${namespace}::${JSON.stringify(normalized)}`;
}

const isFresh = (entry) => Boolean(entry && entry.expiresAt > Date.now());

/**
 * Return a cached value, or run `loader` and cache its result.
 *
 * @param {string} key cache key (see `queryKey`)
 * @param {() => Promise<any>} loader performs the request
 * @param {{ ttl?: number, force?: boolean }} options
 */
export async function cached(key, loader, options = {}) {
  const { ttl = DEFAULT_TTL, force = false } = options;
  const existing = store.get(key);

  if (!force) {
    if (existing?.promise) return existing.promise;
    if (isFresh(existing)) return existing.value;
  }

  const promise = (async () => {
    const value = await loader();
    store.set(key, { value, expiresAt: Date.now() + ttl });
    return value;
  })();

  // Keep the previous value available while the refresh is in flight.
  store.set(key, {
    value: existing?.value,
    expiresAt: existing?.expiresAt ?? 0,
    promise,
  });

  try {
    return await promise;
  } catch (error) {
    if (isFresh(existing)) store.set(key, existing);
    else if (store.get(key)?.promise === promise) store.delete(key);
    throw error;
  }
}

/** Read a cached value without triggering a request (mainly for tests). */
export function peekCache(key) {
  const entry = store.get(key);
  return isFresh(entry) ? entry.value : undefined;
}

/** Drop every entry whose key starts with `prefix` (or all entries). */
export function invalidateQueryCache(prefix = "") {
  if (!prefix) {
    store.clear();
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

/** Drop the entire cache — call on login/logout to avoid cross-user leaks. */
export function clearQueryCache() {
  store.clear();
}
