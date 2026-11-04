import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import {
  ChecklistSchema,
  type Checklist,
  type Step,
} from '../src/lib/schema.ts';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const CHECKLISTS_DIR = path.join(ROOT, 'checklists');
export const GENERATED_FILE = path.join(ROOT, 'src', 'generated', 'checklists.json');

export interface ChecklistFile {
  file: string;
  relativeFile: string;
  slug: string;
  checklist: Checklist;
}

export interface ChecklistFileWarning {
  file: string;
  message: string;
}

export class ChecklistValidationError extends Error {
  constructor(
    message: string,
    readonly file: string,
  ) {
    super(message);
    this.name = 'ChecklistValidationError';
  }
}

export function formatZodError(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .map((issue) => {
      const issuePath = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${issuePath}: ${issue.message}`;
    })
    .join('\n');
}

export function parseChecklistSource(
  source: string,
  file: string,
  slug: string,
): Checklist {
  let raw: unknown;
  try {
    raw = yaml.load(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ChecklistValidationError(`invalid YAML: ${message}`, file);
  }

  const result = ChecklistSchema.safeParse(raw);
  if (!result.success) {
    throw new ChecklistValidationError(
      `schema validation failed:\n${formatZodError(result.error)}`,
      file,
    );
  }

  if (result.data.slug !== slug) {
    throw new ChecklistValidationError(
      `slug "${result.data.slug}" does not match filename "${slug}.yaml"`,
      file,
    );
  }

  return result.data;
}

export function validateChecklistFile(
  filePath: string,
  root = ROOT,
): { checklist: Checklist; warnings: ChecklistFileWarning[] } {
  const filename = path.basename(filePath);
  const slug = filename.replace(/\.ya?ml$/i, '');
  const relativeFile = path.relative(root, filePath);
  const source = readFileSync(filePath, 'utf8');
  const checklist = parseChecklistSource(source, relativeFile, slug);

  const warnings: ChecklistFileWarning[] = [];
  const achievementUsage = new Map<number, string[]>();

  for (const chapter of checklist.chapters) {
    for (const step of chapter.steps) {
      const uniqueIds = new Set(step.achievementIds ?? []);
      for (const id of uniqueIds) {
        const uses = achievementUsage.get(id) ?? [];
        uses.push(step.id);
        achievementUsage.set(id, uses);
      }
    }
  }

  for (const [id, stepIds] of achievementUsage) {
    if (stepIds.length > 1) {
      warnings.push({
        file: relativeFile,
        message: `achievement ${id} is linked from multiple steps (${stepIds.join(', ')}); this is allowed but may be a mistake`,
      });
    }
  }

  return { checklist, warnings };
}

export function listChecklistFiles(dir = CHECKLISTS_DIR): string[] {
  return readdirSync(dir)
    .filter((name) => /\.ya?ml$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => path.join(dir, name));
}

export function readChecklists(dir = CHECKLISTS_DIR): {
  files: ChecklistFile[];
  warnings: ChecklistFileWarning[];
} {
  const files: ChecklistFile[] = [];
  const warnings: ChecklistFileWarning[] = [];

  for (const file of listChecklistFiles(dir)) {
    const { checklist, warnings: fileWarnings } = validateChecklistFile(file);
    files.push({
      file,
      relativeFile: path.relative(ROOT, file),
      slug: checklist.slug,
      checklist,
    });
    warnings.push(...fileWarnings);
  }

  return { files, warnings };
}

export function compileChecklists(files: ChecklistFile[]): string {
  const sorted = [...files]
    .map((entry) => entry.checklist)
    .sort((a, b) => a.title.localeCompare(b.title));
  return `${JSON.stringify(sorted, null, 2)}\n`;
}

export function buildChecklists(): {
  files: ChecklistFile[];
  warnings: ChecklistFileWarning[];
  outputFile: string;
} {
  const { files, warnings } = readChecklists();
  mkdirSync(path.dirname(GENERATED_FILE), { recursive: true });
  writeFileSync(GENERATED_FILE, compileChecklists(files), 'utf8');
  return { files, warnings, outputFile: GENERATED_FILE };
}

const STABLE_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;

export function stepChapterMap(checklist: Checklist): Map<string, string> {
  const map = new Map<string, string>();
  for (const chapter of checklist.chapters) {
    for (const step of chapter.steps) map.set(step.id, chapter.id);
  }
  return map;
}

export function allStepIds(checklist: Checklist): string[] {
  return checklist.chapters.flatMap((chapter) =>
    chapter.steps.map((step) => step.id),
  );
}

export function isValidId(id: string): boolean {
  return STABLE_ID.test(id);
}

export function stepLabel(step: Step): string {
  return `${step.id} (${step.text.slice(0, 60)}${step.text.length > 60 ? '…' : ''})`;
}
