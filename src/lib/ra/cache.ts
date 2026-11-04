import type { RaGameProgress } from './api';

export const RA_CACHE_PREFIX = 'ra-planner:ra-cache:v1:';
export const RA_CACHE_MAX_AGE_MS = 5 * 60 * 1000;

export interface RaCacheEntry {
  fetchedAt: number;
  data: RaGameProgress;
}

function key(gameId: number): string {
  return `${RA_CACHE_PREFIX}${gameId}`;
}

export function getCachedRa(gameId: number): RaCacheEntry | null {
  try {
    const raw = localStorage.getItem(key(gameId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RaCacheEntry>;
    if (
      typeof parsed.fetchedAt !== 'number' ||
      !parsed.data ||
      typeof parsed.data !== 'object' ||
      parsed.data.gameId !== gameId ||
      typeof parsed.data.achievements !== 'object'
    ) {
      return null;
    }
    return parsed as RaCacheEntry;
  } catch {
    return null;
  }
}

export function setCachedRa(gameId: number, data: RaGameProgress): RaCacheEntry {
  const entry: RaCacheEntry = { fetchedAt: Date.now(), data };
  try {
    localStorage.setItem(key(gameId), JSON.stringify(entry));
  } catch {
    // Cache is best effort; the live response is still displayed.
  }
  return entry;
}

export function clearRaCache(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const storageKey = localStorage.key(i);
      if (storageKey?.startsWith(RA_CACHE_PREFIX)) keys.push(storageKey);
    }
    for (const storageKey of keys) localStorage.removeItem(storageKey);
  } catch {
    // Non-fatal.
  }
}

export function isCacheStale(entry: RaCacheEntry, now = Date.now()): boolean {
  return now - entry.fetchedAt > RA_CACHE_MAX_AGE_MS;
}
