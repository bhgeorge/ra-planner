const CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '').trim();
const SCOPES =
  'openid email https://www.googleapis.com/auth/drive.appdata';
const SIGNED_IN_KEY = 'ra-planner:google:signed-in';
const EMAIL_KEY = 'ra-planner:google:email';
const GIS_SCRIPT_ID = 'google-identity-services';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: 'needs-auth' | 'config' | 'auth',
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  id_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type?: string; message?: string }) => void;
  requestAccessToken(overrides?: { prompt?: string; login_hint?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type?: string; message?: string }) => void;
  }): TokenClient;
  revoke(token: string, callback?: () => void): void;
}

interface GoogleAccounts {
  oauth2?: GoogleOAuth2;
}

declare global {
  interface Window {
    google?: { accounts?: GoogleAccounts };
  }
}

let scriptPromise: Promise<void> | null = null;
let tokenClient: TokenClient | null = null;
let accessToken: string | null = null;
let expiresAt = 0;

interface PendingRequest {
  resolve: (value: string) => void;
  reject: (reason: AuthError) => void;
}
let pending: PendingRequest | null = null;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasClientId(): boolean {
  return CLIENT_ID.length > 0;
}

export function wasSignedIn(): boolean {
  return storage()?.getItem(SIGNED_IN_KEY) === 'true';
}

export function getEmail(): string | null {
  return storage()?.getItem(EMAIL_KEY) ?? null;
}

function setEmail(email: string | null): void {
  try {
    if (email) storage()?.setItem(EMAIL_KEY, email);
    else storage()?.removeItem(EMAIL_KEY);
  } catch {
    // Non-fatal display detail.
  }
}

function markSignedIn(value: boolean): void {
  try {
    if (value) storage()?.setItem(SIGNED_IN_KEY, 'true');
    else storage()?.removeItem(SIGNED_IN_KEY);
  } catch {
    // Non-fatal: the user can sign in again.
  }
}

export function hasValidToken(): boolean {
  return accessToken !== null && expiresAt - 60_000 > Date.now();
}

export function clearToken(): void {
  accessToken = null;
  expiresAt = 0;
}

function decodeEmail(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = idToken.split('.')[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));
    const data = JSON.parse(decoded) as { email?: unknown };
    return typeof data.email === 'string' ? data.email : null;
  } catch {
    return null;
  }
}

export function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new AuthError('Google sign-in needs a browser.', 'auth'));
  }
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GIS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new AuthError('Could not load Google sign-in.', 'auth')),
      );
      return;
    }

    const script = document.createElement('script');
    script.id = GIS_SCRIPT_ID;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      scriptPromise = null;
      reject(new AuthError('Could not load Google sign-in.', 'auth'));
    });
    document.head.appendChild(script);
  });

  return scriptPromise;
}

function handleTokenResponse(response: TokenResponse): void {
  const request = pending;
  pending = null;
  if (!request) return;

  if (response.error || !response.access_token) {
    request.reject(
      new AuthError(
        response.error_description || response.error || 'Google sign-in was cancelled.',
        'needs-auth',
      ),
    );
    return;
  }

  accessToken = response.access_token;
  const seconds = Number(response.expires_in ?? 3600);
  expiresAt = Date.now() + (Number.isFinite(seconds) ? seconds : 3600) * 1000;
  markSignedIn(true);
  const email = decodeEmail(response.id_token);
  if (email) setEmail(email);
  request.resolve(accessToken);
}

function handleTokenError(error: { type?: string; message?: string }): void {
  const request = pending;
  pending = null;
  if (!request) return;
  request.reject(
    new AuthError(
      error.message || error.type || 'Google sign-in was cancelled.',
      'needs-auth',
    ),
  );
}

async function getClient(): Promise<TokenClient> {
  if (!CLIENT_ID) {
    throw new AuthError(
      'Google sync is not configured. Set VITE_GOOGLE_CLIENT_ID at build time.',
      'config',
    );
  }
  await loadGisScript();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new AuthError('Google sign-in is unavailable.', 'auth');

  if (!tokenClient) {
    tokenClient = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: handleTokenResponse,
      error_callback: handleTokenError,
    });
  }
  return tokenClient;
}

async function requestToken(prompt: string): Promise<string> {
  if (hasValidToken()) return accessToken!;
  if (pending) {
    return new Promise<string>((resolve, reject) => {
      const original = pending!;
      pending = {
        resolve: (value) => {
          original.resolve(value);
          resolve(value);
        },
        reject: (reason) => {
          original.reject(reason);
          reject(reason);
        },
      };
    });
  }

  const client = await getClient();
  return new Promise<string>((resolve, reject) => {
    pending = { resolve, reject };
    try {
      client.requestAccessToken({ prompt });
    } catch (error) {
      pending = null;
      reject(
        new AuthError(
          error instanceof Error ? error.message : 'Google sign-in failed.',
          'auth',
        ),
      );
    }
  });
}

/** Interactive sign-in from a user gesture. */
export async function signIn(): Promise<string> {
  return requestToken('select_account');
}

/** Best-effort silent refresh. Never opens a popup. */
export async function silentSignIn(): Promise<string> {
  return requestToken('');
}

export async function getAccessToken(options: {
  interactive?: boolean;
} = {}): Promise<string> {
  if (hasValidToken()) return accessToken!;
  if (options.interactive) return signIn();
  try {
    return await silentSignIn();
  } catch (error) {
    clearToken();
    throw error instanceof AuthError
      ? error
      : new AuthError('Google sign-in is required.', 'needs-auth');
  }
}

export function signOut(): void {
  const token = accessToken;
  clearToken();
  markSignedIn(false);
  setEmail(null);

  try {
    if (token && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(token);
    }
  } catch {
    // Token is already unusable locally.
  }
}

/** Called after a 401 so the next attempt performs a silent refresh. */
export function invalidateToken(): void {
  clearToken();
}
