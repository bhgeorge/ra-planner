import { watch } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildChecklists,
  CHECKLISTS_DIR,
  ChecklistValidationError,
  type ChecklistFileWarning,
} from './checklists-lib.ts';

function printWarnings(warnings: ChecklistFileWarning[]): void {
  for (const warning of warnings) {
    console.warn(`warning: ${warning.file}: ${warning.message}`);
  }
}

function reportSuccess(count: number, outputFile: string, warnings: ChecklistFileWarning[]): void {
  printWarnings(warnings);
  console.log(
    `checklists: compiled ${count} checklist${count === 1 ? '' : 's'} -> ${path.relative(process.cwd(), outputFile)}`,
  );
}

function reportFailure(error: unknown): void {
  if (error instanceof ChecklistValidationError) {
    console.error(`\nInvalid checklist in ${error.file}:\n${error.message}\n`);
  } else if (error instanceof Error) {
    console.error(`\nChecklist build failed: ${error.message}\n`);
  } else {
    console.error('\nChecklist build failed:', error, '\n');
  }
}

export function watchChecklists(): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let queued = false;

  const run = () => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      const result = buildChecklists();
      reportSuccess(result.files.length, result.outputFile, result.warnings);
    } catch (error) {
      reportFailure(error);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        run();
      }
    }
  };

  run();

  console.log(`checklists: watching ${path.relative(process.cwd(), CHECKLISTS_DIR)} for changes`);
  watch(CHECKLISTS_DIR, { persistent: true }, (_event, filename) => {
    if (filename && !/\.ya?ml$/i.test(filename)) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 150);
  });
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--watch')) {
    watchChecklists();
    return;
  }

  try {
    const result = buildChecklists();
    reportSuccess(result.files.length, result.outputFile, result.warnings);
  } catch (error) {
    reportFailure(error);
    process.exitCode = 1;
  }
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) main();
