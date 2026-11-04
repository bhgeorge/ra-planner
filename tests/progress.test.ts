import { describe, expect, it } from 'vitest';
import { ChecklistSchema, type Checklist, type GameState } from '../src/lib/schema';
import { computeProgress, isOutOfOrder } from '../src/lib/progress';

const checklist: Checklist = ChecklistSchema.parse({
  slug: 'test-game',
  title: 'Test Game',
  version: 1,
  chapters: [
    {
      id: 'ch-one',
      title: 'Chapter one',
      steps: [
        { id: 's-1', text: 'First step' },
        { id: 's-2', text: 'Second step' },
      ],
    },
    {
      id: 'ch-two',
      title: 'Chapter two',
      steps: [
        { id: 's-3', text: 'Third step' },
        { id: 's-4', text: 'Fourth step' },
      ],
    },
  ],
});

function game(checked: string[], resetAt = 0): GameState {
  const items: GameState['items'] = {};
  for (const id of checked) items[id] = { c: true, t: 100 };
  return { items, resetAt, lastOpenedAt: 0 };
}

describe('computeProgress', () => {
  it('starts at the first chapter and step', () => {
    const progress = computeProgress(checklist, game([]));
    expect(progress.currentChapterId).toBe('ch-one');
    expect(progress.nextStep?.id).toBe('s-1');
    expect(progress.overall).toEqual({ done: 0, total: 4 });
    expect(progress.chapterProgress['ch-one']).toEqual({ done: 0, total: 2 });
    expect(progress.complete).toBe(false);
  });

  it('moves to the next chapter when one is finished', () => {
    const progress = computeProgress(checklist, game(['s-1', 's-2']));
    expect(progress.currentChapterId).toBe('ch-two');
    expect(progress.nextStep?.id).toBe('s-3');
    expect(progress.chapterProgress['ch-one']).toEqual({ done: 2, total: 2 });
    expect(progress.overall).toEqual({ done: 2, total: 4 });
  });

  it('reports completion when every step is checked', () => {
    const progress = computeProgress(checklist, game(['s-1', 's-2', 's-3', 's-4']));
    expect(progress.complete).toBe(true);
    expect(progress.currentChapterId).toBeNull();
    expect(progress.nextStep).toBeNull();
    expect(progress.overall).toEqual({ done: 4, total: 4 });
  });

  it('returns the first unchecked step inside the current chapter', () => {
    const progress = computeProgress(checklist, game(['s-2']));
    expect(progress.currentChapterId).toBe('ch-one');
    expect(progress.nextStep?.id).toBe('s-1');
  });

  it('ignores orphaned item IDs', () => {
    const progress = computeProgress(
      checklist,
      game(['s-retired', 's-orphan']),
    );
    expect(progress.overall).toEqual({ done: 0, total: 4 });
    expect(progress.nextStep?.id).toBe('s-1');
  });

  it('treats items checked before reset as unchecked', () => {
    const progress = computeProgress(
      checklist,
      game(['s-1', 's-2'], 200),
    );
    expect(progress.currentChapterId).toBe('ch-one');
    expect(progress.overall.done).toBe(0);
  });
});

describe('isOutOfOrder', () => {
  it('flags steps in later chapters but not the current one', () => {
    const current = game(['s-3']);
    expect(isOutOfOrder(checklist, current, 's-1')).toBe(false);
    expect(isOutOfOrder(checklist, current, 's-3')).toBe(true);
    expect(isOutOfOrder(checklist, current, 's-4')).toBe(true);
  });

  it('does not flag steps within the current chapter', () => {
    const current = game(['s-1', 's-2', 's-3']);
    expect(isOutOfOrder(checklist, current, 's-3')).toBe(false);
    expect(isOutOfOrder(checklist, current, 's-4')).toBe(false);
  });

  it('does not flag anything once the checklist is complete', () => {
    const complete = game(['s-1', 's-2', 's-3', 's-4']);
    expect(isOutOfOrder(checklist, complete, 's-4')).toBe(false);
  });
});
