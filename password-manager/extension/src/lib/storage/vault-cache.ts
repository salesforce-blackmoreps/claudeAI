import type { VaultItemDto } from "@password-manager/shared";

/**
 * Local ciphertext cache in chrome.storage.local, keyed by item id. Only
 * encrypted blobs and non-secret metadata are ever stored here — see
 * invariant #10. `cursor` is the last sync cursor from GET /vault/sync so a
 * reopened popup can resume an incremental sync instead of re-fetching
 * everything.
 */
interface VaultCache {
  items: Record<string, VaultItemDto>;
  cursor: string | null;
  schemaVersion: number;
}

const CACHE_KEY = "vault-cache";
const CURRENT_SCHEMA_VERSION = 1;

async function readCache(): Promise<VaultCache> {
  const result = await chrome.storage.local.get(CACHE_KEY);
  const cache = result[CACHE_KEY] as VaultCache | undefined;
  if (!cache || cache.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return { items: {}, cursor: null, schemaVersion: CURRENT_SCHEMA_VERSION };
  }
  return cache;
}

async function writeCache(cache: VaultCache): Promise<void> {
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function getCachedItems(): Promise<VaultItemDto[]> {
  const cache = await readCache();
  return Object.values(cache.items).filter((item) => !item.deletedAt);
}

export async function getCursor(): Promise<string | null> {
  return (await readCache()).cursor;
}

/** Merges a sync page into the cache: upserts changed items, drops tombstones. */
export async function mergeSyncPage(items: VaultItemDto[], cursor: string): Promise<void> {
  const cache = await readCache();
  for (const item of items) {
    if (item.deletedAt) {
      delete cache.items[item.id];
    } else {
      cache.items[item.id] = item;
    }
  }
  cache.cursor = cursor;
  await writeCache(cache);
}

export async function upsertItem(item: VaultItemDto): Promise<void> {
  const cache = await readCache();
  cache.items[item.id] = item;
  await writeCache(cache);
}

export async function removeItem(itemId: string): Promise<void> {
  const cache = await readCache();
  delete cache.items[itemId];
  await writeCache(cache);
}

export async function clearCache(): Promise<void> {
  await chrome.storage.local.remove(CACHE_KEY);
}
