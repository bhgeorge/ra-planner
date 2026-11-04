import { z } from 'zod';

/** IDs are shared by chapters and steps within one checklist. */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const idSchema = z
  .string()
  .regex(ID_PATTERN, 'must match ^[a-z0-9][a-z0-9-]{1,39}$ (2-40 chars, lowercase)');

const nonEmptyText = z.string().trim().min(1, 'must not be empty');

const urlSchema = z.string().trim().refine(
  (value) => {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  },
  { message: 'must be a valid http(s) URL' },
);

export const SourceSchema = z
  .object({
    title: nonEmptyText,
    url: urlSchema,
  })
  .strict();

export const StepSchema = z
  .object({
    id: idSchema,
    text: nonEmptyText,
    location: nonEmptyText.optional(),
    note: nonEmptyText.optional(),
    achievementIds: z.array(z.number().int().positive()).min(1).optional(),
  })
  .strict();

export const ChapterSchema = z
  .object({
    id: idSchema,
    title: nonEmptyText,
    summary: nonEmptyText.optional(),
    steps: z.array(StepSchema).min(1, 'each chapter needs at least one step'),
  })
  .strict();

export const ChecklistSchema = z
  .object({
    slug: z
      .string()
      .regex(SLUG_PATTERN, 'must be a kebab-case slug')
      .max(80, 'must be 80 characters or fewer'),
    title: nonEmptyText,
    raGameId: z.number().int().positive().optional(),
    console: nonEmptyText.optional(),
    version: z.number().int().positive(),
    sources: z.array(SourceSchema).min(1).optional(),
    chapters: z.array(ChapterSchema).min(1, 'a checklist needs at least one chapter'),
  })
  .strict()
  .superRefine((checklist, ctx) => {
    const seen = new Map<string, string>();

    checklist.chapters.forEach((chapter, chapterIndex) => {
      const chapterKey = seen.get(chapter.id);
      if (chapterKey) {
        ctx.addIssue({
          code: 'custom',
          path: ['chapters', chapterIndex, 'id'],
          message: `duplicate id "${chapter.id}"; ids must be unique across chapters and steps`,
        });
      } else {
        seen.set(chapter.id, `chapters[${chapterIndex}]`);
      }

      chapter.steps.forEach((step, stepIndex) => {
        const key = seen.get(step.id);
        if (key) {
          ctx.addIssue({
            code: 'custom',
            path: ['chapters', chapterIndex, 'steps', stepIndex, 'id'],
            message: `duplicate id "${step.id}"; also used by ${key}`,
          });
        } else {
          seen.set(step.id, `chapters[${chapterIndex}].steps[${stepIndex}]`);
        }
      });
    });
  });

export const ItemStateSchema = z
  .object({
    c: z.boolean(),
    t: z.number().int().nonnegative(),
  })
  .strict();

export const GameStateSchema = z
  .object({
    items: z.record(z.string(), ItemStateSchema),
    resetAt: z.number().int().nonnegative(),
    lastOpenedAt: z.number().int().nonnegative(),
  })
  .strict();

export const AppStateSchema = z
  .object({
    schema: z.literal(1),
    games: z.record(z.string(), GameStateSchema),
  })
  .strict();

export const SyncMetaSchema = z
  .object({
    lastSyncedAt: z.number().int().nonnegative().nullable().default(null),
    fileId: z.string().min(1).nullable().default(null),
  })
  .strict();

export type Source = z.infer<typeof SourceSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Chapter = z.infer<typeof ChapterSchema>;
export type Checklist = z.infer<typeof ChecklistSchema>;

export type ItemState = z.infer<typeof ItemStateSchema>;
export type GameState = z.infer<typeof GameStateSchema>;
export type AppState = z.infer<typeof AppStateSchema>;
export type SyncMeta = z.infer<typeof SyncMetaSchema>;

export function parseChecklist(input: unknown): Checklist {
  return ChecklistSchema.parse(input);
}

export function safeParseChecklist(input: unknown) {
  return ChecklistSchema.safeParse(input);
}

export function parseAppState(input: unknown): AppState {
  return AppStateSchema.parse(input);
}

export function safeParseAppState(input: unknown) {
  return AppStateSchema.safeParse(input);
}
