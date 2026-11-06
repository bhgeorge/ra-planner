# RA Planner

A phone-first, offline-capable PWA for working through **order-dependent checklists** while playing games on [RetroAchievements](https://retroachievements.org). Following the checklist in order should mean never missing a missable achievement.

- One checklist per game, divided into ordered chapters and steps.
- Check state lives in `localStorage` and works fully offline. Back up manually by sharing a JSON file from Settings (for example to Google Drive).
- Optional RetroAchievements integration shows achievement icons, titles, points, and earned status. It is informational only and never checks steps automatically.
- Checklists are YAML files in `checklists/`, compiled at build time. The app never parses third-party guides.

## Quick start

Requirements: Node.js 26+ (tested with Node 26.13) and pnpm 12. The pnpm version is pinned in `package.json` via `packageManager`; if pnpm is not installed, run `npm install -g pnpm@12`.

```bash
pnpm install
pnpm dev
```

Open <http://localhost:5173>. The checklists in `checklists/` appear in the library.

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

## Backups

Check state lives on the device in `localStorage`. There is no account and no automatic sync.

- **Share backup (JSON)** in **Settings → Data** opens the Android share sheet with a `ra-planner-backup-YYYY-MM-DD.json` file. Pick Drive (or any other app) to store it. On browsers that cannot share files, the same button downloads the file instead.
- **Import backup (JSON)** merges an existing backup into the current state. Merge is commutative, associative, and idempotent, so importing never erases newer checks.
- Backups contain checklist progress only. RetroAchievements credentials are never included.

Sharing a new backup to Drive does not update the app automatically. To restore, download the file and use **Import backup**.

## RetroAchievements setup

1. Find your Web API key in your [RA control panel](https://retroachievements.org/controlpanel.php).
2. In **Settings → RetroAchievements**, enter your username and key, then **Save credentials** and **Test connection**.

Credentials are stored on that device only. They are never uploaded, included in backups, committed, or logged. The key is masked after entry.

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

A step is effectively checked only when `c === true` and `t > resetAt`. **Reset checklist** sets `resetAt` to now instead of deleting history, so the reset merges correctly. Steps checked after the reset remain checked.

**Share backup** and **Import backup** in Settings provide manual backup and restore. Import merges, never overwrites.

## Repository layout

```text
checklists/                 YAML source of truth
docs/                       authoring guide and M0 spike notes
scripts/                    checklist compiler and validator
src/lib/                    schema, state, backup, progress, RA, router
src/routes/                 Library, Game, Settings
src/components/             shared UI
src/generated/              compiled checklists (gitignored)
public/                     icons and favicon
tests/                      Vitest unit tests
```

## Privacy

- Checklist state stays on this device unless you share a backup.
- RA credentials stay in this browser's `localStorage` and are never included in backups.
- The app has no backend. RA requests go directly to retroachievements.org or through the optional proxy you host.
- If you add a CORS proxy, do not log request URLs: they contain the RA Web API key.
