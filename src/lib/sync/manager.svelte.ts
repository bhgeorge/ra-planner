import type { AppState } from '../schema';
import { merge, statesEqual, loadSyncMeta, saveSyncMeta } from '../state';
import { appStore } from '../store.svelte';
import {
  AuthError,
  clearToken,
  getAccessToken,
  hasClientId,
  invalidateToken,
  wasSignedIn,
} from './auth';
import {
  createStateFile,
  downloadState,
  DriveError,
  findStateFile,
  updateStateFile,
} from './drive';

export type SyncStatusKind =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'offline'
  | 'signed-out'
  | 'error';

export type SyncTrigger = 'open' | 'visibility' | 'change' | 'manual' | 'pending';

const LOCAL_CHANGE_DEBOUNCE_MS = 3_000;
const VISIBILITY_THROTTLE_MS = 30_000;
const MAX_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class SyncManager {
  status = $state<SyncStatusKind>(
    typeof navigator !== 'undefined' && !navigator.onLine
      ? 'offline'
      : wasSignedIn()
        ? 'idle'
        : 'signed-out',
  );
  lastSyncedAt = $state<number | null>(loadSyncMeta().lastSyncedAt);
  error = $state<string | null>(null);

  private initialized = false;
  private syncing = false;
  private pending = false;
  private localTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVisibilitySync = 0;

  init(): void {
    if (this.initialized || typeof window === 'undefined') return;
    this.initialized = true;

    appStore.onChange(() => this.scheduleAfterChange());

    window.addEventListener('online', () => {
      if (wasSignedIn()) void this.syncNow('open');
      else if (this.status === 'offline') this.status = 'signed-out';
    });

    window.addEventListener('offline', () => {
      this.status = 'offline';
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!navigator.onLine) {
        this.status = 'offline';
        return;
      }
      const now = Date.now();
      if (now - this.lastVisibilitySync < VISIBILITY_THROTTLE_MS) return;
      this.lastVisibilitySync = now;
      if (wasSignedIn()) void this.syncNow('visibility');
    });

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status = 'offline';
    } else if (hasClientId() && wasSignedIn()) {
      // Give the initial paint a moment before attempting a silent token.
      setTimeout(() => void this.syncNow('open'), 600);
    }
  }

  markSignedOut(): void {
    this.status = 'signed-out';
    this.error = null;
  }

  markSignedIn(): void {
    if (this.status === 'signed-out') this.status = 'idle';
    this.error = null;
  }

  private scheduleAfterChange(): void {
    if (!hasClientId() || !wasSignedIn()) return;
    if (this.localTimer) clearTimeout(this.localTimer);
    this.localTimer = setTimeout(() => {
      this.localTimer = null;
      void this.syncNow('change');
    }, LOCAL_CHANGE_DEBOUNCE_MS);
  }

  async syncNow(
    trigger: SyncTrigger = 'manual',
    options: { interactive?: boolean } = {},
  ): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.status = 'offline';
      return false;
    }

    if (!hasClientId()) {
      this.status = 'signed-out';
      this.error =
        'Google sync is not configured. Set VITE_GOOGLE_CLIENT_ID at build time.';
      return false;
    }

    if (!wasSignedIn() && !options.interactive) {
      this.status = 'signed-out';
      return false;
    }

    if (this.syncing) {
      this.pending = true;
      return false;
    }

    this.syncing = true;
    this.status = 'syncing';
    this.error = null;

    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
        try {
          const token = await getAccessToken({
            interactive: options.interactive && attempt === 0,
          });
          await this.performSync(token);
          this.lastSyncedAt = Date.now();
          saveSyncMeta({
            ...loadSyncMeta(),
            lastSyncedAt: this.lastSyncedAt,
          });
          this.status = 'synced';
          this.error = null;
          return true;
        } catch (error) {
          if (error instanceof AuthError) {
            if (error.code === 'config') {
              this.status = 'signed-out';
              this.error = error.message;
              return false;
            }
            clearToken();
            this.status = 'signed-out';
            this.error = options.interactive ? error.message : null;
            return false;
          }

          if (error instanceof DriveError && error.status === 401) {
            invalidateToken();
            if (attempt < MAX_ATTEMPTS - 1) {
              await delay(300);
              continue;
            }
            this.status = 'signed-out';
            this.error = 'Google session expired. Sign in again.';
            return false;
          }

          if (error instanceof DriveError && error.kind === 'corrupt') {
            this.status = 'error';
            this.error = error.message;
            return false;
          }

          if (attempt < MAX_ATTEMPTS - 1) {
            await delay(600 * (attempt + 1));
            continue;
          }

          this.status = 'error';
          this.error =
            error instanceof Error ? error.message : 'Sync failed.';
          return false;
        }
      }
      return false;
    } finally {
      this.syncing = false;
      if (this.pending) {
        this.pending = false;
        setTimeout(() => void this.syncNow('pending'), 1_000);
      }
    }
  }

  private async performSync(token: string): Promise<void> {
    const meta = loadSyncMeta();
    let fileId = meta.fileId;
    let remote: AppState | null = null;

    if (fileId) {
      try {
        remote = await downloadState(token, fileId);
      } catch (error) {
        if (error instanceof DriveError && error.status === 404) {
          fileId = null;
          remote = null;
        } else {
          throw error;
        }
      }
    }

    if (!fileId) {
      fileId = await findStateFile(token);
      if (fileId) remote = await downloadState(token, fileId);
    }

    if (!fileId) {
      const createdId = await createStateFile(token, appStore.state);
      saveSyncMeta({ lastSyncedAt: Date.now(), fileId: createdId });
      return;
    }

    if (!remote) {
      throw new DriveError('Could not read the Drive state file.');
    }

    // Read local state after the network round-trip so concurrent edits are
    // included; any later edit schedules another sync.
    const local = appStore.state;
    const merged = merge(local, remote);

    if (!statesEqual(merged, local)) appStore.applyRemote(merged);
    if (!statesEqual(merged, remote)) {
      await updateStateFile(token, fileId, merged);
    }

    saveSyncMeta({ lastSyncedAt: Date.now(), fileId });
  }
}

export const syncManager = new SyncManager();
