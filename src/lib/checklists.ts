import rawChecklists from '../generated/checklists.json';
import { ChecklistSchema, type Checklist } from './schema';

/**
 * The build pipeline validates these files; parsing again gives us a typed,
 * trusted value and catches a stale/corrupt generated file early.
 */
export const checklists: Checklist[] = rawChecklists.map((checklist) =>
  ChecklistSchema.parse(checklist),
);

export const checklistBySlug = new Map(
  checklists.map((checklist) => [checklist.slug, checklist]),
);

export const checklistVersions = checklists.map((checklist) => ({
  slug: checklist.slug,
  title: checklist.title,
  version: checklist.version,
}));

export function getChecklist(slug: string): Checklist | undefined {
  return checklistBySlug.get(slug);
}
