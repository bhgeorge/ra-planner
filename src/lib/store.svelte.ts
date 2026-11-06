import {
  emptyGameState,
  flushStateSave,
  loadState,
  merge,
  resetGame,
  scheduleStateSave,
  toggleItem,
  touchGame,
  requestPersistentStorage,
} from './state';
import type { AppState, GameState } from './schema';

type ChangeListener = () => void;

class AppStore {
  state = $state<AppState>(loadState());
  private listeners = new Set<ChangeListener>();

  constructor() {
    void requestPersistentStorage();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => flushStateSave());
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushStateSave();
      });
    }
  }

  getGame(slug: string): GameState | undefined {
    return this.state.games[slug];
  }

  ensureGame(slug: string): GameState {
    return this.state.games[slug] ?? emptyGameState();
  }

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private commit(next: AppState, notify = true): void {
    this.state = next;
    scheduleStateSave(next);
    if (notify) {
      for (const listener of this.listeners) listener();
    }
  }

  touch(slug: string, now = Date.now()): void {
    const next = touchGame(this.state, slug, now);
    if (next !== this.state) this.commit(next);
  }

  toggle(slug: string, stepId: string, now = Date.now()): boolean {
    const wasChecked = this.isChecked(slug, stepId);
    this.commit(toggleItem(this.state, slug, stepId, now));
    return !wasChecked;
  }

  isChecked(slug: string, stepId: string): boolean {
    const game = this.state.games[slug];
    if (!game) return false;
    const item = game.items[stepId];
    return item?.c === true && item.t > game.resetAt;
  }

  reset(slug: string, now = Date.now()): void {
    this.commit(resetGame(this.state, slug, now));
  }

  /** Manual import: merge, never overwrite. */
  importState(imported: AppState): void {
    this.commit(merge(this.state, imported));
  }

  flush(): void {
    flushStateSave();
  }
}

export const appStore = new AppStore();
