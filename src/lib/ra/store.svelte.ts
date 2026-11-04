import {
  clearCredentials,
  fetchGameProgress,
  loadCredentials,
  saveCredentials,
  type RaCredentials,
  type RaGameProgress,
} from './api';
import {
  clearRaCache,
  getCachedRa,
  isCacheStale,
  setCachedRa,
  type RaCacheEntry,
} from './cache';

const PROXY_URL = (import.meta.env.VITE_RA_PROXY_URL ?? '').trim();

class RaStore {
  credentials = $state<RaCredentials | null>(loadCredentials());
  entries = $state<Record<string, RaCacheEntry>>({});
  loading = $state<Record<string, boolean>>({});
  errors = $state<Record<string, string | null>>({});

  get hasCredentials(): boolean {
    return this.credentials !== null;
  }

  get proxyConfigured(): boolean {
    return PROXY_URL.length > 0;
  }

  entryFor(gameId: number): RaCacheEntry | undefined {
    return this.entries[String(gameId)] ?? getCachedRa(gameId) ?? undefined;
  }

  isLoading(gameId: number): boolean {
    return this.loading[String(gameId)] === true;
  }

  errorFor(gameId: number): string | null {
    return this.errors[String(gameId)] ?? null;
  }

  isStale(gameId: number): boolean {
    const entry = this.entryFor(gameId);
    if (!entry) return false;
    return isCacheStale(entry) || this.errorFor(gameId) !== null;
  }

  dataFor(gameId: number): RaGameProgress | undefined {
    return this.entryFor(gameId)?.data;
  }

  saveCredentials(credentials: RaCredentials): void {
    const previous = this.credentials;
    const usernameChanged =
      previous !== null &&
      previous.username.toLowerCase() !== credentials.username.toLowerCase();

    saveCredentials(credentials);
    this.credentials = {
      username: credentials.username.trim(),
      apiKey: credentials.apiKey.trim(),
    };

    if (usernameChanged || previous === null) {
      clearRaCache();
      this.entries = {};
      this.errors = {};
    }
  }

  removeCredentials(): void {
    clearCredentials();
    clearRaCache();
    this.credentials = null;
    this.entries = {};
    this.errors = {};
    this.loading = {};
  }

  async load(
    gameId: number,
    options: { force?: boolean; fetchImpl?: typeof fetch } = {},
  ): Promise<void> {
    const key = String(gameId);
    const existing = this.entryFor(gameId);

    if (existing && !this.entries[key]) {
      this.entries = { ...this.entries, [key]: existing };
    }

    if (!this.credentials) return;
    if (!options.force && existing && !isCacheStale(existing)) return;
    if (this.loading[key]) return;

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.errors = {
        ...this.errors,
        [key]: existing
          ? 'Offline — showing cached RetroAchievements data.'
          : 'Offline — RetroAchievements data is unavailable.',
      };
      return;
    }

    this.loading = { ...this.loading, [key]: true };
    try {
      const data = await fetchGameProgress(this.credentials, gameId, {
        proxyUrl: PROXY_URL || undefined,
        fetchImpl: options.fetchImpl,
      });
      const entry = setCachedRa(gameId, data);
      this.entries = { ...this.entries, [key]: entry };
      this.errors = { ...this.errors, [key]: null };
    } catch (error) {
      this.errors = {
        ...this.errors,
        [key]:
          error instanceof Error
            ? error.message
            : 'Could not load RetroAchievements data.',
      };
    } finally {
      this.loading = { ...this.loading, [key]: false };
    }
  }

  async testConnection(gameId: number): Promise<RaGameProgress> {
    if (!this.credentials) {
      throw new Error('Enter a RetroAchievements username and Web API key first.');
    }
    const data = await fetchGameProgress(this.credentials, gameId, {
      proxyUrl: PROXY_URL || undefined,
    });
    const entry = setCachedRa(gameId, data);
    this.entries = { ...this.entries, [String(gameId)]: entry };
    this.errors = { ...this.errors, [String(gameId)]: null };
    return data;
  }
}

export const raStore = new RaStore();
