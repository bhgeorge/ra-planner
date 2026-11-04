import { loadKeepAwake, saveKeepAwake } from './prefs';

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

class WakeLockStore {
  supported = $state(
    typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  );
  enabled = $state(loadKeepAwake());
  error = $state<string | null>(null);
  private sentinel: WakeLockSentinelLike | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized || typeof document === 'undefined') return;
    this.initialized = true;

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.enabled) {
        void this.acquire();
      }
    });

    if (this.enabled) void this.acquire();
  }

  async setEnabled(value: boolean): Promise<void> {
    this.enabled = value;
    saveKeepAwake(value);
    if (value) await this.acquire();
    else await this.release();
  }

  async acquire(): Promise<void> {
    if (!this.enabled) return;
    const wakeLock = (navigator as unknown as { wakeLock?: WakeLockLike })
      .wakeLock;
    if (!wakeLock) {
      this.error = 'Screen Wake Lock is not supported by this browser.';
      return;
    }
    if (this.sentinel && !this.sentinel.released) return;

    try {
      const sentinel = await wakeLock.request('screen');
      this.sentinel = sentinel;
      this.error = null;
      sentinel.addEventListener('release', () => {
        if (this.sentinel === sentinel) this.sentinel = null;
      });
    } catch (error) {
      this.error =
        error instanceof Error
          ? error.message
          : 'Could not keep the screen awake.';
    }
  }

  async release(): Promise<void> {
    const sentinel = this.sentinel;
    this.sentinel = null;
    if (!sentinel || sentinel.released) return;
    try {
      await sentinel.release();
    } catch {
      // Already released by the system.
    }
  }
}

export const wakeLock = new WakeLockStore();
