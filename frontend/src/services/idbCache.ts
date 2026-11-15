import type { RegionAnalysisResponse } from '../contracts/types.ts';

const DB_NAME = 'trend_detective_cache_v2';
const STORE_NAME = 'region_analyses';
const DB_VERSION = 1;
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

export interface CacheEntry {
  readonly key: string;
  readonly savedAt: number;
  readonly payload: RegionAnalysisResponse;
}

/**
 * Cache resiliente baseado em IndexedDB com fallback automático em memória
 * para ambientes de teste (Node) ou navegadores com armazenamento bloqueado.
 */
export class RegionAnalysisCache {
  private readonly memoryFallback = new Map<string, CacheEntry>();

  constructor(private readonly ttlMs = DEFAULT_TTL_MS) {}

  private isFresh(entry: CacheEntry): boolean {
    return Number.isFinite(entry.savedAt) && Date.now() - entry.savedAt <= this.ttlMs;
  }

  private isIdbAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Falha ao abrir IndexedDB.'));
    });
  }

  async get(key: string): Promise<RegionAnalysisResponse | null> {
    const memHit = this.memoryFallback.get(key);
    if (memHit && this.isFresh(memHit)) {
      return memHit.payload;
    }
    if (memHit) this.memoryFallback.delete(key);

    if (!this.isIdbAvailable()) {
      return null;
    }

    try {
      const db = await this.openDb();
      return await new Promise<RegionAnalysisResponse | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => {
          const entry = req.result as CacheEntry | undefined;
          if (entry && this.isFresh(entry)) {
            this.memoryFallback.set(key, entry);
            resolve(entry.payload);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async set(key: string, payload: RegionAnalysisResponse): Promise<void> {
    const entry: CacheEntry = {
      key,
      savedAt: Date.now(),
      payload,
    };
    this.memoryFallback.set(key, entry);

    if (!this.isIdbAvailable()) {
      return;
    }

    try {
      const db = await this.openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      // Mantém em memória caso IndexedDB falhe por quota/permissão.
    }
  }

  clearMemory(): void {
    this.memoryFallback.clear();
  }
}

export const defaultRegionCache = new RegionAnalysisCache();
