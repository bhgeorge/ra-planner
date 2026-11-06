import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import { ChecklistSchema } from '../src/lib/schema';
import {
  ChecklistValidationError,
  parseChecklistSource,
} from '../scripts/checklists-lib';

function exampleSource(): string {
  return readFileSync(
    new URL('./fixtures/example-game.yaml', import.meta.url),
    'utf8',
  );
}

function exampleObject(): Record<string, unknown> {
  return yaml.load(exampleSource()) as Record<string, unknown>;
}

describe('ChecklistSchema', () => {
  it('accepts the example checklist', () => {
    const result = ChecklistSchema.safeParse(exampleObject());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.slug).toBe('example-game');
      expect(result.data.chapters.length).toBeGreaterThan(0);
    }
  });

  it('rejects duplicate IDs across chapters and steps', () => {
    const checklist = exampleObject();
    const chapters = checklist.chapters as Array<{
      steps: Array<Record<string, unknown>>;
    }>;
    chapters[1].steps[0].id = chapters[0].steps[0].id as string;

    const result = ChecklistSchema.safeParse(checklist);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid ID format', () => {
    const checklist = exampleObject();
    const chapters = checklist.chapters as Array<{
      steps: Array<Record<string, unknown>>;
    }>;
    chapters[0].steps[0].id = 'Bad_ID';

    const result = ChecklistSchema.safeParse(checklist);
    expect(result.success).toBe(false);
  });

  it('rejects a chapter with no steps', () => {
    const checklist = exampleObject();
    const chapters = checklist.chapters as Array<{ steps: unknown[] }>;
    chapters[0].steps = [];

    const result = ChecklistSchema.safeParse(checklist);
    expect(result.success).toBe(false);
  });

  it('rejects a checklist with no chapters', () => {
    const checklist = exampleObject();
    checklist.chapters = [];

    const result = ChecklistSchema.safeParse(checklist);
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys', () => {
    const checklist = exampleObject();
    checklist.unexpected = true;

    const result = ChecklistSchema.safeParse(checklist);
    expect(result.success).toBe(false);
  });

  it('rejects an invalid step achievement ID', () => {
    const checklist = exampleObject();
    const chapters = checklist.chapters as Array<{
      steps: Array<Record<string, unknown>>;
    }>;
    chapters[0].steps[0].achievementIds = [0];

    const result = ChecklistSchema.safeParse(checklist);
    expect(result.success).toBe(false);
  });
});

describe('filename and slug validation', () => {
  it('rejects a slug that does not match the filename', () => {
    expect(() =>
      parseChecklistSource(exampleSource(), 'other-game.yaml', 'other-game'),
    ).toThrow(ChecklistValidationError);
  });

  it('accepts a matching slug', () => {
    const checklist = parseChecklistSource(
      exampleSource(),
      'example-game.yaml',
      'example-game',
    );
    expect(checklist.title).toBe('Example Game');
  });
});
