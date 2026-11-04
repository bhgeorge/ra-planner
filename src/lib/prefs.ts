const PREFIX = 'ra-planner:ui:v1';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadExpandedChapters(slug: string): string[] | null {
  try {
    const raw = storage()?.getItem(`${PREFIX}:expanded:${slug}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((id) => typeof id === 'string')
      ? parsed
      : null;
  } catch {
    return null;
  }
}

export function saveExpandedChapters(slug: string, ids: Iterable<string>): void {
  try {
    storage()?.setItem(`${PREFIX}:expanded:${slug}`, JSON.stringify([...ids]));
  } catch {
    // Non-fatal preference.
  }
}

export function loadTextToggles(): boolean {
  return storage()?.getItem(`${PREFIX}:text-toggles`) !== 'false';
}

export function saveTextToggles(value: boolean): void {
  try {
    storage()?.setItem(`${PREFIX}:text-toggles`, String(value));
  } catch {
    // Non-fatal preference.
  }
}

export function loadKeepAwake(): boolean {
  return storage()?.getItem(`${PREFIX}:keep-awake`) === 'true';
}

export function saveKeepAwake(value: boolean): void {
  try {
    storage()?.setItem(`${PREFIX}:keep-awake`, String(value));
  } catch {
    // Non-fatal preference.
  }
}
