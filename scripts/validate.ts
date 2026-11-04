import { execFileSync } from 'node:child_process';
import path from 'node:path';
import {
  ROOT,
  ChecklistValidationError,
  listChecklistFiles,
  parseChecklistSource,
  stepChapterMap,
  validateChecklistFile,
  type ChecklistFile,
  type ChecklistFileWarning,
} from './checklists-lib.ts';
import type { Checklist } from '../src/lib/schema.ts';

interface CliOptions {
  against: string | null;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { against: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--against') {
      const ref = argv[i + 1];
      if (!ref || ref.startsWith('--')) {
        throw new Error('--against requires a git ref, for example --against HEAD');
      }
      options.against = ref;
      i += 1;
    } else if (arg.startsWith('--against=')) {
      options.against = arg.slice('--against='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: pnpm validate [-- --against <git-ref>]');
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function git(args: string[], allowFailure = false): string | null {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (allowFailure) return null;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`git ${args.join(' ')} failed: ${message}`);
  }
}

function loadCurrentFiles(): { files: ChecklistFile[]; warnings: ChecklistFileWarning[] } {
  const files: ChecklistFile[] = [];
  const warnings: ChecklistFileWarning[] = [];
  const errors: Array<{ file: string; message: string }> = [];

  for (const file of listChecklistFiles()) {
    try {
      const result = validateChecklistFile(file);
      files.push({
        file,
        relativeFile: path.relative(ROOT, file),
        slug: result.checklist.slug,
        checklist: result.checklist,
      });
      warnings.push(...result.warnings);
    } catch (error) {
      if (error instanceof ChecklistValidationError) {
        errors.push({ file: error.file, message: error.message });
      } else {
        errors.push({
          file: path.relative(ROOT, file),
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`\nInvalid checklist in ${error.file}:\n${error.message}`);
    }
    console.error('');
    process.exit(1);
  }

  return { files, warnings };
}

function oldChecklistAt(
  ref: string,
  relativeFile: string,
  slug: string,
): Checklist | null {
  const source = git(['show', `${ref}:${relativeFile}`], true);
  if (source === null) return null;
  try {
    return parseChecklistSource(source, `${relativeFile}@${ref}`, slug);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`warning: could not parse ${relativeFile} at ${ref}; skipping comparison (${message})`);
    return null;
  }
}

function compareAgainst(ref: string, currentFiles: ChecklistFile[]): void {
  git(['rev-parse', '--verify', `${ref}^{commit}`]);

  const oldFiles = (git(['ls-tree', '-r', '--name-only', ref, '--', 'checklists'], true) ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^checklists\/.+\.ya?ml$/.test(line));

  const currentRelative = new Set(currentFiles.map((file) => file.relativeFile));
  let infoCount = 0;
  let warningCount = 0;

  for (const oldFile of oldFiles) {
    if (!currentRelative.has(oldFile)) {
      console.warn(`warning: ${oldFile} was removed; its step state will become orphaned`);
      warningCount += 1;
    }
  }

  for (const entry of currentFiles) {
    const old = oldChecklistAt(ref, entry.relativeFile, entry.slug);
    if (!old) {
      console.log(`info: ${entry.relativeFile} is new at ${ref}; ${entry.checklist.chapters.reduce((n, c) => n + c.steps.length, 0)} step IDs added`);
      infoCount += 1;
      continue;
    }

    const oldMap = stepChapterMap(old);
    const newMap = stepChapterMap(entry.checklist);

    for (const [id, chapter] of oldMap) {
      const newChapter = newMap.get(id);
      if (newChapter === undefined) {
        console.warn(`warning: ${entry.relativeFile}: step ID ${id} was removed; its state will become orphaned`);
        warningCount += 1;
      } else if (newChapter !== chapter) {
        console.log(`info: ${entry.relativeFile}: step ${id} moved from ${chapter} to ${newChapter}`);
        infoCount += 1;
      }
    }

    for (const [id, chapter] of newMap) {
      if (!oldMap.has(id)) {
        console.log(`info: ${entry.relativeFile}: new step ${id} in ${chapter}`);
        infoCount += 1;
      }
    }

    if (old.version !== entry.checklist.version) {
      console.log(`info: ${entry.relativeFile}: version ${old.version} -> ${entry.checklist.version}`);
      infoCount += 1;
    }
  }

  console.log(
    `\ncompared ${currentFiles.length} checklist${currentFiles.length === 1 ? '' : 's'} against ${ref}: ${infoCount} info, ${warningCount} warning${warningCount === 1 ? '' : 's'}`,
  );
}

function main(): void {
  let options: CliOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const { files, warnings } = loadCurrentFiles();
  for (const warning of warnings) {
    console.warn(`warning: ${warning.file}: ${warning.message}`);
  }

  if (options.against) {
    try {
      compareAgainst(options.against, files);
    } catch (error) {
      console.error(`\nCould not compare against ${options.against}: ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  console.log(
    `validated ${files.length} checklist${files.length === 1 ? '' : 's'} successfully`,
  );
}

main();
