# RA Planner

A phone-first, offline-capable PWA for working through **order-dependent checklists** while playing games on [RetroAchievements](https://retroachievements.org). Following the checklist in order should mean never missing a missable achievement.

- One checklist per game, divided into ordered chapters and steps.
- Check state lives in `localStorage`, works fully offline, and syncs between devices through a hidden Google Drive `appDataFolder` file.
- Optional RetroAchievements integration shows achievement icons, titles, points, and earned status. It is informational only and never checks steps automatically.
- Checklists are YAML files in `checklists/`, compiled at build time. The app never parses third-party guides.

## Quick start

Requirements: Node.js 20.19+ or 22.12+ (tested with Node 24) and pnpm 12. The pnpm version is pinned in `package.json` via `packageManager`; run `corepack enable` once if pnpm is not already installed.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:5173>. The example checklist is at `checklists/example-game.yaml`.

### Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Compiles checklists, watches `checklists/`, starts Vite on port 5173. |
| `pnpm build` | Validates and compiles checklists, then builds `dist/`. |
| `pnpm preview` | Serves the production build locally. |
| `pnpm validate` | Schema validation only. Add `-- --against <git-ref>` to compare IDs with a previous revision. |
| `pnpm checklists` | Compile YAML to `src/generated/checklists.json`. |
| `pnpm test` | Run Vitest unit tests. |
| `pnpm typecheck` | Run `svelte-check` over the app and scripts. |

## Writing checklists

Read [`docs/CHECKLIST_AUTHORING.md`](docs/CHECKLIST_AUTHORING.md). It is written to be pasted to an AI agent together with a walkthrough, and includes the full schema, ID-stability rules, chunking advice, and verification steps.

Every checklist is a YAML file in `checklists/`. The filename must match `slug`. After editing:

```bash
pnpm validate
pnpm validate -- --against HEAD   # when regenerating an existing file
```

The build fails on schema errors and prints the file, path, and message. Duplicate achievement IDs across steps are warnings, not errors.

## Google Drive sync setup

Sync is optional. Without configuration the app works entirely locally.

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Drive API** for the project.
3. Configure the **OAuth consent screen**:
   - User type: External is fine for a personal app.
   - Add the scope `https://www.googleapis.com/auth/drive.appdata`. The app also requests `openid` and `email` so Settings can show the signed-in account.
   - Publish the app to **In production** when you are ready. `drive.appdata`, `openid`, and `email` are non-sensitive scopes, so verification is not normally required. Keeping the app in "Testing" works too, but test-mode consent and refresh tokens have shorter lifetimes and may cause more frequent re-consent.
4. Create credentials → **OAuth client ID** → **Web application**.
5. Add **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - `https://<your-github-username>.github.io` (origin only — no repository path)
   - Any custom domain you deploy to.
6. Put the client ID in `.env.local`:

   ```bash
   VITE_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
   ```

   Restart `pnpm dev` after changing environment variables.

The client ID is not a secret. Access tokens are kept in memory only. The app stores a "previously signed in" flag and email address locally so it can try a silent token request on open; if that fails it falls back to a "Sign in" state without blocking local use.

The sync file is named `ra-planner-state.json` and lives in the app's hidden `appDataFolder`. It is not visible in the normal Drive UI. The app merges local and remote state on every sync; merge is commutative, associative, and idempotent, so offline edits on two devices are preserved except for the same item edited on both, where the newest timestamp wins.

### Sync behavior

- Sync attempts run on open, when the page becomes visible again (throttled to 30 s), 3 s after local changes, and from **Sync now**.
- Sync is skipped when offline or signed out; changes accumulate locally.
- On HTTP 401 the token is dropped and the app asks you to sign in again.
- Corrupt or unexpected remote JSON is never overwritten; the error appears in Settings and local state is kept.

## RetroAchievements setup

1. Find your Web API key in your [RA control panel](https://retroachievements.org/controlpanel.php).
2. In **Settings → RetroAchievements**, enter your username and key, then **Save credentials** and **Test connection**.

Credentials are stored on that device only. They are never written to Drive, exported, committed, or logged. The key is masked after entry.

Add `raGameId` to a checklist to enable RA data for it. The app calls:

```text
GET https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?y=<key>&u=<user>&g=<gameId>
```

Responses are cached in `localStorage` per game. Cached data is shown immediately; a refresh happens when the cache is older than five minutes. Offline or API errors leave the checklist fully usable and mark RA data as stale.

### Optional CORS proxy

The RA Web API may reject browser requests from your origin. If direct requests fail, deploy a minimal proxy that forwards the request and adds CORS headers. Set:

```bash
VITE_RA_PROXY_URL=https://your-worker.example.workers.dev/ra
```

The app appends `y`, `u`, and `g` as query parameters to that URL. A minimal Cloudflare Worker:

```js
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const username = incoming.searchParams.get('u');
    const apiKey = incoming.searchParams.get('y');
    const gameId = incoming.searchParams.get('g');

    if (!username || !apiKey || !gameId) {
      return new Response('Missing u, y, or g', { status: 400 });
    }

    const target = new URL(
      'https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php',
    );
    target.searchParams.set('u', username);
    target.searchParams.set('y', apiKey);
    target.searchParams.set('g', gameId);

    const upstream = await fetch(target, {
      headers: { Accept: 'application/json' },
    });

    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    headers.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
    headers.set('Cache-Control', 'no-store');

    // Do not log the request URL: it contains the user's API key.
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
```

Set `ALLOWED_ORIGIN` to your deployed origin (for example `https://your-name.github.io`). The proxy must not log or persist query parameters, because `y` is the user's API key.

## Deploying to GitHub Pages

The workflow at `.github/workflows/deploy.yml` runs on pushes to `main`:

1. `pnpm install --frozen-lockfile`
2. `pnpm test`
3. `pnpm build`
4. Uploads `dist/` and deploys to GitHub Pages.

The workflow installs the pnpm version pinned in `package.json` and caches the pnpm store.

In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. The workflow sets `VITE_BASE_PATH` to `/<repository-name>/` automatically; override it if you use a custom domain.

Add repository **variables** (Settings → Secrets and variables → Actions → Variables):

| Variable | Required | Purpose |
|---|---|---|
| `VITE_GOOGLE_CLIENT_ID` | For sync | OAuth Web client ID. |
| `VITE_RA_PROXY_URL` | No | CORS proxy base URL. |
| `VITE_BASE_PATH` | No | Override the repository path; include leading/trailing slashes. |

## PWA and offline behavior

- The service worker precaches the app shell and the compiled checklist data.
- New deployments show an **Update available — reload** toast. This is how edited or new checklists arrive on the phone.
- RA achievement badge images use a stale-while-revalidate runtime cache.
- RA API JSON is cached by the app, not the service worker.
- **Keep screen awake** in the game menu uses the Screen Wake Lock API and re-acquires the lock when the page becomes visible.
- Install from Chrome on Android using **Add to Home screen**.

## Data model and reset semantics

Check state is keyed by step ID:

```ts
type ItemState = { c: boolean; t: number };
type GameState = { items: Record<string, ItemState>; resetAt: number; lastOpenedAt: number };
type AppState = { schema: 1; games: Record<string, GameState> };
```

A step is effectively checked only when `c === true` and `t > resetAt`. **Reset checklist** sets `resetAt` to now instead of deleting history, so the reset merges correctly and unchecks steps on all synced devices. Steps checked after the reset remain checked.

**Export state** and **Import state** in Settings provide a manual backup. Import merges, never overwrites.

## Repository layout

```text
checklists/                 YAML source of truth
docs/                       authoring guide and M0 spike notes
scripts/                    checklist compiler and validator
src/lib/                    schema, state, progress, sync, RA, router
src/routes/                 Library, Game, Settings
src/components/             shared UI
src/generated/              compiled checklists (gitignored)
public/                     icons and favicon
tests/                      Vitest unit tests
```

## Privacy

- Checklist state syncs only to your own Google Drive app data folder.
- RA credentials stay in this browser's `localStorage`.
- The app has no backend other than Google Drive and the optional RA proxy you host.
- If you add a CORS proxy, do not log request URLs: they contain the RA Web API key.
