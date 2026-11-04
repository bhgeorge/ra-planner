import type { Chapter, Checklist, GameState, Step } from './schema';
import { isChecked } from './state';

export interface Count {
  done: number;
  total: number;
}

export interface Progress {
  chapterProgress: Record<string, Count>;
  currentChapterId: string | null;
  currentChapter: Chapter | null;
  nextStep: Step | null;
  nextStepChapterId: string | null;
  overall: Count;
  complete: boolean;
}

function chapterCount(chapter: Chapter, game: GameState | undefined): Count {
  let done = 0;
  for (const step of chapter.steps) {
    if (isChecked(game, step.id)) done += 1;
  }
  return { done, total: chapter.steps.length };
}

export function computeProgress(
  checklist: Checklist,
  game: GameState | undefined,
): Progress {
  const chapterProgress: Record<string, Count> = {};
  let overallDone = 0;
  let overallTotal = 0;
  let currentChapter: Chapter | null = null;

  for (const chapter of checklist.chapters) {
    const count = chapterCount(chapter, game);
    chapterProgress[chapter.id] = count;
    overallDone += count.done;
    overallTotal += count.total;
    if (!currentChapter && count.done < count.total) currentChapter = chapter;
  }

  let nextStep: Step | null = null;
  if (currentChapter) {
    nextStep = currentChapter.steps.find((step) => !isChecked(game, step.id)) ?? null;
  }

  return {
    chapterProgress,
    currentChapterId: currentChapter?.id ?? null,
    currentChapter,
    nextStep,
    nextStepChapterId: currentChapter?.id ?? null,
    overall: { done: overallDone, total: overallTotal },
    complete: currentChapter === null,
  };
}

export function findStep(checklist: Checklist, stepId: string): Step | undefined {
  for (const chapter of checklist.chapters) {
    const step = chapter.steps.find((candidate) => candidate.id === stepId);
    if (step) return step;
  }
  return undefined;
}

export function findStepChapter(
  checklist: Checklist,
  stepId: string,
): Chapter | undefined {
  return checklist.chapters.find((chapter) =>
    chapter.steps.some((step) => step.id === stepId),
  );
}

/**
 * v1 out-of-order rule is chapter-level: flag steps in chapters after the
 * current (first not-fully-complete) chapter.
 */
export function isOutOfOrder(
  checklist: Checklist,
  game: GameState | undefined,
  stepId: string,
): boolean {
  const progress = computeProgress(checklist, game);
  if (!progress.currentChapterId) return false;
  const stepChapterIndex = checklist.chapters.findIndex((chapter) =>
    chapter.steps.some((step) => step.id === stepId),
  );
  const currentIndex = checklist.chapters.findIndex(
    (chapter) => chapter.id === progress.currentChapterId,
  );
  return stepChapterIndex > currentIndex;
}
