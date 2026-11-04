export interface RaCredentials {
  username: string;
  apiKey: string;
}

export interface RaAchievement {
  id: number;
  title: string;
  description: string;
  points: number;
  badgeName: string | null;
  badgeUrl: string | null;
  earned: boolean;
  earnedMode: 'softcore' | 'hardcore' | null;
  dateEarned: string | null;
  dateEarnedHardcore: string | null;
}

export interface RaGameProgress {
  gameId: number;
  title: string;
  consoleName: string;
  imageIcon: string | null;
  numAchievements: number;
  numAwarded: number;
  numAwardedHardcore: number;
  achievements: Record<string, RaAchievement>;
}

export class RaApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'RaApiError';
  }
}

export const RA_API_BASE = 'https://retroachievements.org/API';
export const RA_MEDIA_BASE = 'https://media.retroachievements.org';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function pick(source: UnknownRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function asDate(value: unknown): string | null {
  const text = asString(value).trim();
  if (!text || text.startsWith('0000-00-00')) return null;
  return text;
}

function badgeUrl(badgeName: string | null): string | null {
  if (!badgeName) return null;
  if (/^https?:\/\//i.test(badgeName)) return badgeName;
  const clean = badgeName.replace(/\.png$/i, '');
  return `${RA_MEDIA_BASE}/Badge/${encodeURIComponent(clean)}.png`;
}

function normalizeImageIcon(value: unknown): string | null {
  const icon = asString(value).trim();
  if (!icon) return null;
  if (/^https?:\/\//i.test(icon)) return icon;
  return `${RA_MEDIA_BASE}${icon.startsWith('/') ? '' : '/'}${icon}`;
}

function achievementEntries(raw: unknown): Array<[string, UnknownRecord]> {
  if (Array.isArray(raw)) {
    return raw
      .map((entry, index) => {
        const item = record(entry);
        if (!item) return null;
        const id = asString(pick(item, 'ID', 'Id', 'id')) || String(index);
        return [id, item] as [string, UnknownRecord];
      })
      .filter((entry): entry is [string, UnknownRecord] => entry !== null);
  }

  const object = record(raw);
  if (!object) return [];
  return Object.entries(object)
    .map(([key, value]) => {
      const item = record(value);
      return item ? ([key, item] as [string, UnknownRecord]) : null;
    })
    .filter((entry): entry is [string, UnknownRecord] => entry !== null);
}

function parseAchievement(id: string, item: UnknownRecord): RaAchievement {
  const dateEarned = asDate(pick(item, 'DateEarned', 'dateEarned'));
  const dateEarnedHardcore = asDate(
    pick(item, 'DateEarnedHardcore', 'dateEarnedHardcore'),
  );
  const achieved = asNumber(pick(item, 'Achieved', 'achieved'));
  const earned = Boolean(dateEarned || dateEarnedHardcore || achieved);
  const badgeName = asString(pick(item, 'BadgeName', 'badgeName')) || null;

  const numericId = Number(id);
  return {
    id: Number.isFinite(numericId) ? numericId : asNumber(pick(item, 'ID', 'Id', 'id')),
    title: asString(pick(item, 'Title', 'title')) || `Achievement ${id}`,
    description: asString(pick(item, 'Description', 'description')),
    points: asNumber(pick(item, 'Points', 'points')),
    badgeName,
    badgeUrl: badgeUrl(badgeName),
    earned,
    earnedMode: earned
      ? dateEarnedHardcore
        ? 'hardcore'
        : 'softcore'
      : null,
    dateEarned,
    dateEarnedHardcore,
  };
}

/**
 * Parses the GetGameInfoAndUserProgress response. The API has historically
 * returned Achievements as an object keyed by ID; some versions return an
 * array, so both are accepted. Missing optional fields never throw.
 */
export function parseGameProgress(
  raw: unknown,
  gameId: number,
): RaGameProgress {
  const root = record(raw);
  if (!root) {
    throw new RaApiError('RetroAchievements returned an unexpected response.');
  }

  const achievements: Record<string, RaAchievement> = {};
  let earned = 0;
  let hardcore = 0;

  for (const [key, item] of achievementEntries(
    pick(root, 'Achievements', 'achievements'),
  )) {
    const achievement = parseAchievement(key, item);
    achievements[String(achievement.id)] = achievement;
    if (achievement.earned) {
      earned += 1;
      if (achievement.earnedMode === 'hardcore') hardcore += 1;
    }
  }

  const total =
    asNumber(pick(root, 'NumAchievements', 'numAchievements')) ||
    Object.keys(achievements).length;

  return {
    gameId,
    title:
      asString(pick(root, 'Title', 'title')) ||
      `Game ${gameId}`,
    consoleName: asString(pick(root, 'ConsoleName', 'consoleName')),
    imageIcon: normalizeImageIcon(pick(root, 'ImageIcon', 'imageIcon')),
    numAchievements: total,
    numAwarded: earned,
    numAwardedHardcore: hardcore,
    achievements,
  };
}

export function buildRequestUrl(
  credentials: RaCredentials,
  gameId: number,
  proxyUrl?: string,
): string {
  const params = new URLSearchParams({
    y: credentials.apiKey,
    u: credentials.username,
    g: String(gameId),
  });
  const proxy = proxyUrl?.trim();
  if (proxy) {
    const url = new URL(proxy);
    for (const [key, value] of params) url.searchParams.set(key, value);
    return url.toString();
  }
  return `${RA_API_BASE}/API_GetGameInfoAndUserProgress.php?${params.toString()}`;
}

export async function fetchGameProgress(
  credentials: RaCredentials,
  gameId: number,
  options: {
    proxyUrl?: string;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  } = {},
): Promise<RaGameProgress> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildRequestUrl(credentials, gameId, options.proxyUrl);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15_000,
  );

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    throw new RaApiError(
      error instanceof Error && error.name === 'AbortError'
        ? 'RetroAchievements request timed out.'
        : 'Could not reach RetroAchievements. Check your connection or proxy.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new RaApiError(
      `RetroAchievements request failed (HTTP ${response.status}).`,
      response.status,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new RaApiError('RetroAchievements returned invalid JSON.');
  }

  const root = record(raw);
  if (root && (root.Success === false || root.Error)) {
    const message = asString(root.Error) || 'RetroAchievements rejected the request.';
    throw new RaApiError(message);
  }

  return parseGameProgress(raw, gameId);
}

const CREDENTIALS_KEY = 'ra-planner:ra-credentials:v1';

export function loadCredentials(): RaCredentials | null {
  try {
    const raw = localStorage.getItem(CREDENTIALS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RaCredentials>;
    if (
      typeof parsed.username !== 'string' ||
      typeof parsed.apiKey !== 'string' ||
      !parsed.username.trim() ||
      !parsed.apiKey.trim()
    ) {
      return null;
    }
    return {
      username: parsed.username.trim(),
      apiKey: parsed.apiKey.trim(),
    };
  } catch {
    return null;
  }
}

export function saveCredentials(credentials: RaCredentials): void {
  localStorage.setItem(
    CREDENTIALS_KEY,
    JSON.stringify({
      username: credentials.username.trim(),
      apiKey: credentials.apiKey.trim(),
    }),
  );
}

export function clearCredentials(): void {
  localStorage.removeItem(CREDENTIALS_KEY);
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}
