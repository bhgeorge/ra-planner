import type { AppState } from './schema';

export type BackupResult = 'shared' | 'downloaded' | 'cancelled';

export function backupFilename(now: Date = new Date()): string {
  return `ra-planner-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function createBackupFile(state: AppState, now: Date = new Date()): File {
  return new File([JSON.stringify(state, null, 2)], backupFilename(now), {
    type: 'application/json',
  });
}

function canShareFile(file: File): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  );
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

export function downloadBackup(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Open the system share sheet with a JSON backup file. Android lets the user
 * send the file straight to Drive (or any other app). On browsers without file
 * sharing, fall back to a normal download.
 */
export async function shareBackup(state: AppState): Promise<BackupResult> {
  const file = createBackupFile(state);

  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title: 'RA Planner backup' });
      return 'shared';
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      // Some share targets reject files even though canShare() said yes.
      // Fall through to a download instead of losing the backup action.
    }
  }

  downloadBackup(file);
  return 'downloaded';
}
