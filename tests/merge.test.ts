import { describe, expect, it } from 'vitest';
import type { AppState, GameState, ItemState } from '../src/lib/schema';
import {
  emptyState,
  isChecked,
  merge,
  resetGame,
  statesEqual,
  toggleItem,
} from '../src/lib/state';

function game(
  items: Record<string, ItemState> = {},
  resetAt = 0,
  lastOpenedAt = 0,
): GameState {
  return { items, resetAt, lastOpenedAt };
}

function state(games: Record<string, GameState>): AppState {
  return { schema: 1, games };
}

function randomGenerator(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 2 ** 32;
  };
}

function randomState(rand: () => number): AppState {
  const games: Record<string, GameState> = {};
  const slugs = ['alpha', 'beta', 'gamma'].slice(
    0,
    Math.floor(rand() * 4),
  );
  for (const slug of slugs) {
    const items: Record<string, ItemState> = {};
    const count = Math.floor(rand() * 5);
    for (let i = 0; i < count; i += 1) {
      items[`s-${i}`] = {
        c: rand() > 0.5,
        t: Math.floor(rand() * 100),
      };
    }
    games[slug] = game(
      items,
      Math.floor(rand() * 60),
      Math.floor(rand() * 80),
    );
  }
  return state(games);
}

describe('merge', () => {
  it('is commutative', () => {
    const rand = randomGenerator(1);
    for (let i = 0; i < 250; i += 1) {
      const a = randomState(rand);
      const b = randomState(rand);
      expect(statesEqual(merge(a, b), merge(b, a))).toBe(true);
    }
  });

  it('is associative', () => {
    const rand = randomGenerator(2);
    for (let i = 0; i < 250; i += 1) {
      const a = randomState(rand);
      const b = randomState(rand);
      const c = randomState(rand);
      expect(
        statesEqual(merge(merge(a, b), c), merge(a, merge(b, c))),
      ).toBe(true);
    }
  });

  it('is idempotent', () => {
    const rand = randomGenerator(3);
    for (let i = 0; i < 250; i += 1) {
      const a = randomState(rand);
      expect(statesEqual(merge(a, a), a)).toBe(true);
    }
  });

  it('keeps a newer uncheck over an older check', () => {
    const a = state({ game: game({ 's-1': { c: true, t: 100 } }) });
    const b = state({ game: game({ 's-1': { c: false, t: 200 } }) });
    const result = merge(a, b);
    expect(result.games.game.items['s-1']).toEqual({ c: false, t: 200 });
    expect(isChecked(result.games.game, 's-1')).toBe(false);
  });

  it('keeps a newer check over an older uncheck', () => {
    const a = state({ game: game({ 's-1': { c: false, t: 100 } }) });
    const b = state({ game: game({ 's-1': { c: true, t: 200 } }) });
    expect(isChecked(merge(a, b).games.game, 's-1')).toBe(true);
  });

  it('prefers unchecked on an exact timestamp tie', () => {
    const a = state({ game: game({ 's-1': { c: true, t: 50 } }) });
    const b = state({ game: game({ 's-1': { c: false, t: 50 } }) });
    const result = merge(a, b);
    expect(result.games.game.items['s-1']).toEqual({ c: false, t: 50 });
  });

  it('reset wins over older checks', () => {
    const a = state({
      game: game({ 's-1': { c: true, t: 50 } }, 100),
    });
    const b = state({
      game: game({ 's-1': { c: true, t: 40 } }, 0),
    });
    const result = merge(a, b);
    expect(result.games.game.resetAt).toBe(100);
    expect(isChecked(result.games.game, 's-1')).toBe(false);
  });

  it('checks newer than reset survive the merge', () => {
    const a = state({
      game: game({ 's-1': { c: true, t: 50 } }, 100),
    });
    const b = state({
      game: game({ 's-1': { c: true, t: 200 } }, 0),
    });
    expect(isChecked(merge(a, b).games.game, 's-1')).toBe(true);
  });

  it('keeps orphaned item IDs', () => {
    const a = state({ game: game({ 's-retired': { c: true, t: 20 } }) });
    const b = state({ game: game({ 's-live': { c: true, t: 10 } }) });
    const result = merge(a, b);
    expect(result.games.game.items['s-retired']).toEqual({ c: true, t: 20 });
    expect(result.games.game.items['s-live']).toEqual({ c: true, t: 10 });
  });

  it('unions games and takes the max of game timestamps', () => {
    const a = state({
      alpha: game({}, 10, 20),
      beta: game({}, 5, 1),
    });
    const b = state({
      alpha: game({}, 8, 50),
      gamma: game({}, 0, 0),
    });
    const result = merge(a, b);
    expect(Object.keys(result.games).sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.games.alpha.resetAt).toBe(10);
    expect(result.games.alpha.lastOpenedAt).toBe(50);
  });
});

describe('toggle and reset timestamps', () => {
  it('never decreases an item timestamp on the same device', () => {
    let current = emptyState();
    current = toggleItem(current, 'game', 's-1', 1_000);
    expect(current.games.game.items['s-1']).toEqual({ c: true, t: 1_000 });

    current = toggleItem(current, 'game', 's-1', 500);
    expect(current.games.game.items['s-1'].t).toBe(1_001);
    expect(current.games.game.items['s-1'].c).toBe(false);
  });

  it('unchecks steps that were checked before reset but not after', () => {
    let current = emptyState();
    current = toggleItem(current, 'game', 's-1', 100);
    current = resetGame(current, 'game', 200);
    expect(isChecked(current.games.game, 's-1')).toBe(false);
    current = toggleItem(current, 'game', 's-1', 300);
    expect(isChecked(current.games.game, 's-1')).toBe(true);
  });
});
