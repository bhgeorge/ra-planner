import { AppStateSchema, type AppState } from '../schema';

export const DRIVE_FILE_NAME = 'ra-planner-state.json';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export class DriveError extends Error {
  constructor(
    message: string,
    readonly status: number | null = null,
    readonly kind: 'http' | 'network' | 'corrupt' = 'http',
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

async function request(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new DriveError(
      error instanceof Error ? error.message : 'Network request failed.',
      null,
      'network',
    );
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      detail = body.error?.message ?? '';
    } catch {
      try {
        detail = await response.text();
      } catch {
        detail = '';
      }
    }
    throw new DriveError(
      `Drive request failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      response.status,
    );
  }

  return response;
}

function authHeaders(token: string, extra: Record<string, string> = {}): HeadersInit {
  return { Authorization: `Bearer ${token}`, ...extra };
}

function metadata(body: Record<string, unknown>): Record<string, unknown> {
  return { name: DRIVE_FILE_NAME, mimeType: 'application/json', ...body };
}

export async function findStateFile(token: string): Promise<string | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: `name = '${DRIVE_FILE_NAME}' and trashed = false`,
    fields: 'files(id,name,modifiedTime)',
    orderBy: 'modifiedTime desc',
    pageSize: '10',
  });

  const response = await request(`${DRIVE_API}/files?${params.toString()}`, {
    headers: authHeaders(token),
  });
  const body = (await response.json()) as {
    files?: Array<{ id?: string; name?: string }>;
  };
  const file = body.files?.find((candidate) => candidate.name === DRIVE_FILE_NAME);
  return file?.id ?? null;
}

export async function downloadState(
  token: string,
  fileId: string,
): Promise<AppState> {
  const response = await request(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    { headers: authHeaders(token) },
  );

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new DriveError(
      'The Drive state file is not valid JSON. Local state was kept and the remote file was not overwritten.',
      null,
      'corrupt',
    );
  }

  const parsed = AppStateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DriveError(
      'The Drive state file has an unexpected shape. Local state was kept and the remote file was not overwritten.',
      null,
      'corrupt',
    );
  }
  return parsed.data;
}

export async function createStateFile(
  token: string,
  state: AppState,
): Promise<string> {
  const boundary = `ra-planner-${crypto.randomUUID()}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata({ parents: ['appDataFolder'] })),
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(state),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const response = await request(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: authHeaders(token, {
        'Content-Type': `multipart/related; boundary=${boundary}`,
      }),
      body,
    },
  );

  const result = (await response.json()) as { id?: string };
  if (!result.id) {
    throw new DriveError('Drive did not return a file ID for the new state file.');
  }
  return result.id;
}

export async function updateStateFile(
  token: string,
  fileId: string,
  state: AppState,
): Promise<void> {
  await request(
    `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}?uploadType=media`,
    {
      method: 'PATCH',
      headers: authHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify(state),
    },
  );
}
