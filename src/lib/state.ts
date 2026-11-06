import {
  AppStateSchema,
  type AppState,
  type GameState,
  type ItemState,
} from './schema';

export const STATE_STORAGE_KEY = 'ra-planner:state:v1';
export const PERSIST_REQUESTED_KEY = 'ra-planner:persist-requested';

export function emptyGameState(): GameState {
  return { items: {}, resetAt: 0, lastOpenedAt: 0 };
}

export function emptyState(): AppState {
  return { schema: 1, games: {} };
}

/** A step only reads as checked if it was checked after the last reset. */
export function isChecked(game: GameState | undefined, stepId: string): boolean {
  if (!game) return false;
  const item = game.items[stepId];
  return item?.c === true && item.t > game.resetAt;
}

/** Toggle one step, keeping timestamps monotonic per device. */
export function toggleItem(
  state: AppState,
  slug: string,
  stepId: string,
  now: number = Date.now(),
): AppState {
  const game = state.games[slug] ?? emptyGameState();
  const checked = isChecked(game, stepId);
  const existing = game.items[stepId];
  const t = Math.max(now, (existing?.t ?? 0) + 1);

  return {
    ...state,
    games: {
      ...state.games,
      [slug]: {
        ...game,
        items: {
          ...game.items,
          [stepId]: { c: !checked, t },
        },
      },
    },
  };
}

/** Reset keeps item history; items at or before resetAt simply read as unchecked. */
export function resetGame(
  state: AppState,
  slug: string,
  now: number = Date.now(),
): AppState {
  const game = state.games[slug] ?? emptyGameState();
  return {
    ...state,
    games: {
      ...state.games,
      [slug]: {
        ...game,
        resetAt: Math.max(now, game.resetAt),
      },
    },
  };
}

export function touchGame(
  state: AppState,
  slug: string,
  now: number = Date.now(),
): AppState {
  const game = state.games[slug] ?? emptyGameState();
  if (game.lastOpenedAt >= now) return state;
  return {
    ...state,
    games: {
      ...state.games,
      [slug]: { ...game, lastOpenedAt: now },
    },
  };
}

function mergeItem(a: ItemState | undefined, b: ItemState | undefined): ItemState {
  if (!a) return { ...b! };
  if (!b) return { ...a };
  if (a.t === b.t) {
    // Deterministic tie-break: unchecked wins.
    return { c: a.c && b.c, t: a.t };
  }
  return a.t > b.t ? { ...a } : { ...b };
}

/**
 * Merge two states. Commutative, associative, and idempotent; orphaned item IDs
 * are preserved so a temporary checklist edit cannot destroy progress.
 */
export function merge(a: AppState, b: AppState): AppState {
  const games: Record<string, GameState> = {};

  for (const slug of new Set([...Object.keys(a.games), ...Object.keys(b.games)])) {
    const ga = a.games[slug];
    const gb = b.games[slug];

    if (!ga) {
      games[slug] = { ...gb!, items: { ...gb!.items } };
      continue;
    }
    if (!gb) {
      games[slug] = { ...ga, items: { ...ga.items } };
      continue;
    }

    const items: Record<string, ItemState> = {};
    for (const id of new Set([...Object.keys(ga.items), ...Object.keys(gb.items)])) {
      items[id] = mergeItem(ga.items[id], gb.items[id]);
    }

    games[slug] = {
      items,
      resetAt: Math.max(ga.resetAt, gb.resetAt),
      lastOpenedAt: Math.max(ga.lastOpenedAt, gb.lastOpenedAt),
    };
  }

  return { schema: 1, games };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Order-independent deep equality. */
export function statesEqual(a: AppState, b: AppState): boolean {
  return canonical(a) === canonical(b);
}

function getLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadState(storage: Storage | null = getLocalStorage()): AppState {
  if (!storage) return emptyState();
  try {
    const raw = storage.getItem(STATE_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = AppStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyState();
  } catch {
    return emptyState();
  }
}

export function saveState(
  state: AppState,
  storage: Storage | null = getLocalStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be full or unavailable (private mode). The app still works
    // in memory; the user sees the failure through backup options.
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingState: AppState | null = null;

/** Debounced write, per spec: persist at most every 200 ms. */
export function scheduleStateSave(state: AppState, delay = 200): void {
  pendingState = state;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (pendingState) saveState(pendingState);
    pendingState = null;
    saveTimer = null;
  }, delay);
}

export function flushStateSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (pendingState) {
    saveState(pendingState);
    pendingState = null;
  }
}

/** Ask the browser to keep our storage; called once on first run. */
export async function requestPersistentStorage(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return;
  const storage = getLocalStorage();
  if (storage?.getItem(PERSIST_REQUESTED_KEY) === '1') return;
  try {
    await navigator.storage.persist();
    storage?.setItem(PERSIST_REQUESTED_KEY, '1');
  } catch {
    // Best effort only.
  }
}
