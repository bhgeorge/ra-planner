# RA Planner — Product & Technical Spec

A personal, phone-first web app (PWA) for tracking order-dependent checklists while playing games on retroachievements.org. Following the checklist in order should guarantee the player never misses a missable achievement. Check state syncs between devices through Google Drive.

This document is written to be executed by an implementation agent. Where something is unverified it is marked **VERIFY** and has a corresponding spike task in Milestone 0.

---

## 1. Goals and non-goals

### Goals
1. Show one checklist per game: ordered **chapters**, each containing ordered **steps** the player checks off.
2. Persist check state locally (works fully offline) and sync it between the user's phone (Pixel 8, Chrome) and desktop via Google Drive.
3. Allow un-checking at any time (mistakes, going back). Sync must handle un-checks correctly.
4. Optionally link a step to one or more RetroAchievements achievements and display each achievement's name, icon, and the user's earned status via the RA Web API.
5. Checklists are plain files in the repo, generated and edited by an AI agent or by hand. The app never parses third-party guides.

### Non-goals (v1)
- In-app editing of checklists (edit source files; may be added later if it becomes painful).
- Multiple playthroughs per game or run history. One live checklist per game, with a Reset action.
- Multi-user features, accounts other than the owner's Google account, public sharing.
- Auto-checking steps from RA unlock data (RA status is displayed only).
- A native app. This is a PWA.

### Design principle
The whole point is to remove the need to think about missables. Therefore: chapters are chunks that should be **fully completed before moving to the next chapter**. The UI should make "what do I do next" unmistakable and gently warn when the user is out of order.

---

## 2. Stack

| Concern | Choice |
|---|---|
| Framework | Svelte 5 (runes) + TypeScript, built with Vite. No SvelteKit. |
| Routing | Tiny hash-based router (GitHub Pages friendly). |
| PWA | `vite-plugin-pwa` (Workbox, `registerType: 'prompt'`). |
| Checklist source format | YAML files in `checklists/`, validated and compiled to JSON at build time. |
| Validation | `zod` schema shared by the build script and the app. |
| Local persistence | `localStorage` (data is tiny). Call `navigator.storage.persist()` on first run. |
| Sync | Google Identity Services (token model) + Drive REST v3, scope `drive.appdata`. No backend. |
| RA data | Direct `fetch` to the RA Web API (no SDK dependency). |
| Tests | Vitest (unit); Playwright smoke test optional. |
| Hosting | GitHub Pages via GitHub Actions. |

Keep dependencies minimal: `svelte`, `vite`, `vite-plugin-pwa`, `zod`, `js-yaml` (build-time), `vitest`.

---

## 3. Repository layout

```
/
├─ SPEC.md
├─ checklists/                  # source of truth, one file per game
│  └─ example-game.yaml
├─ docs/
│  └─ CHECKLIST_AUTHORING.md    # instructions for the AI agent that generates checklists (see §12)
├─ scripts/
│  ├─ build-checklists.ts       # validate + compile YAML -> src/generated/checklists.json
│  └─ validate.ts               # `pnpm validate`, optional `--against <git-ref>` (see §5.4)
├─ src/
│  ├─ generated/                # gitignored build output
│  ├─ lib/
│  │  ├─ schema.ts              # zod schemas + TS types (checklist + state)
│  │  ├─ state.ts               # state store, merge function, persistence
│  │  ├─ progress.ts            # current chapter / next step / counts
│  │  ├─ sync/
│  │  │  ├─ auth.ts             # GIS token handling
│  │  │  └─ drive.ts            # appDataFolder read/write
│  │  └─ ra/
│  │     ├─ api.ts              # RA fetch wrapper
│  │     └─ cache.ts            # response cache
│  ├─ routes/                   # Library.svelte, Game.svelte, Settings.svelte
│  ├─ components/
│  └─ main.ts
├─ public/                      # icons, manifest assets
├─ .github/workflows/deploy.yml
└─ vite.config.ts
```

---

## 4. Checklist file format (source of truth)

One YAML file per game in `checklists/`. Filename is a kebab-case slug and is the game's local key (`slug`).

### 4.1 Schema

```yaml
slug: example-game              # must match filename (without .yaml)
title: Example Game
raGameId: 12345                 # number; optional but required for RA integration
console: SNES                   # optional, display only
version: 1                      # integer; bump on any edit (display + debugging only)
sources:                        # optional; guides this was derived from
  - title: Some Walkthrough
    url: https://example.com/guide

chapters:
  - id: ch-intro                # unique within the game
    title: Intro stage
    summary: Optional one-liner about the chunk.   # optional
    steps:
      - id: s-4f2a9c            # unique within the game, stable forever (see 4.2)
        text: Talk to the shopkeeper before buying anything.
        note: Optional longer explanation or warning.   # optional
        achievementIds: [98012]                          # optional, RA achievement IDs
      - id: s-81be07
        text: Grab the hidden key in the second room.
```

Rules enforced by the validator (build fails on violation):
- `slug` matches filename; `title` non-empty.
- Every `chapters[].id` and `steps[].id` matches `^[a-z0-9][a-z0-9-]{1,39}$` and is unique **across the whole file** (chapters and steps share one namespace).
- Each chapter has at least one step; the file has at least one chapter.
- `text` is non-empty plain text (no markdown). `note` is plain text; bare URLs are auto-linked at render time.
- `achievementIds` entries are positive integers. Duplicate IDs across different steps are allowed (warn, do not fail).
- Unknown keys are rejected.

Note: the user asked for an `achievementId`; this spec uses the array `achievementIds` because one step sometimes completes several achievements. A single-element array covers the simple case.

### 4.2 ID stability (critical)
Check state is keyed by step ID. Therefore:
- An ID is assigned once when a step is created and **never changes** while the step still means the same thing, even if its text is reworded or it is moved to another chapter.
- Removing a step retires its ID; IDs are never reused for a different step.
- Newly created steps get new IDs. Recommended format: `s-` + 6 random lowercase hex characters (for example `s-4f2a9c`). Chapters use readable slugs prefixed `ch-`.
- When regenerating a checklist from an updated guide, the agent must be given the existing file and must preserve IDs for unchanged or merely reworded steps.

### 4.3 Build step
`scripts/build-checklists.ts` reads every YAML file, validates it with the zod schema, and writes `src/generated/checklists.json` (an array of checklist objects, sorted by title). It runs before `vite build` and `vite dev` (watch mode in dev). Invalid files fail the build with a readable error (file, path, message).

### 4.4 `validate.ts --against <git-ref>`
Compares each checklist against the same file at the given git ref and reports:
- **Removed IDs** (warning: users' state for these will be orphaned),
- **Step moved between chapters** (info),
- **New IDs** (info).
Exit non-zero only on schema errors, not on warnings. This is a safety net for the agent-regeneration workflow.

---

## 5. Data model: check state

### 5.1 Types

```ts
type ItemState = { c: boolean; t: number };      // c = checked, t = last-modified epoch ms

type GameState = {
  items: Record<string, ItemState>;              // keyed by step id
  resetAt: number;                               // epoch ms; items with t <= resetAt are treated as unchecked
  lastOpenedAt: number;                          // epoch ms, for library sorting (local-only convenience, merged by max)
};

type AppState = {
  schema: 1;
  games: Record<string, GameState>;              // keyed by checklist slug
};
```

### 5.2 Semantics
- Toggling a step sets `items[id] = { c: !current, t: Date.now() }`.
- A step is **effectively checked** iff `items[id]?.c === true && items[id].t > resetAt`.
- **Reset game**: set `resetAt = Date.now()`. (Do not delete items; this keeps merges simple.) Steps then read as unchecked everywhere once synced.
- State for IDs not present in the current checklist ("orphans") is kept in storage but ignored by progress calculations and the UI.
- Clock skew between devices is accepted; this is a single-user tool. Use `Date.now()` but never let a new write's `t` be lower than the existing entry's `t` for the same item on the same device (`t = Math.max(Date.now(), existing.t + 1)`).

### 5.3 Merge function (pure, unit-tested)
`merge(a: AppState, b: AppState): AppState`
- Union of games.
- Per game: `resetAt = max(a.resetAt, b.resetAt)`; `lastOpenedAt = max(...)`.
- Per item ID present in either side: keep the entry with the larger `t`; on exact tie prefer `c: false` (deterministic).
- Result must be **commutative, associative, and idempotent**. Write property-style tests for all three.

### 5.4 Local persistence
Key: `ra-planner:state:v1` in `localStorage`, JSON-serialized `AppState`. Write on every change (debounced 200 ms). Also store `ra-planner:sync-meta` (`lastSyncedAt`, Drive `fileId`).

---

## 6. Google Drive sync

### 6.1 Storage
A single JSON file named `ra-planner-state.json` in the Drive **`appDataFolder`** (hidden from the user's normal Drive UI, scoped to this app). Contents: the serialized `AppState`.

### 6.2 Auth
- Google Identity Services **token model** (`google.accounts.oauth2.initTokenClient`), scope `https://www.googleapis.com/auth/drive.appdata`.
- Client ID provided via `VITE_GOOGLE_CLIENT_ID` (it is not a secret). Authorized JavaScript origins must include the GitHub Pages origin and `http://localhost:5173`.
- On app open and when the page becomes visible again, if the user previously signed in (flag in localStorage), attempt a silent token request (`prompt: ''`). If it fails, show a non-blocking "Sign in to sync" button. Never block local use on auth.
- Access tokens last about an hour and are kept in memory only.
- **VERIFY** (Milestone 0): how often the phone PWA needs interactive re-auth in practice, and whether the OAuth consent screen must be set to "In production" to avoid periodic re-consent for a personal app. `drive.appdata` is a non-sensitive scope, so verification is not expected to be required.

### 6.3 Sync procedure
Triggered: on app open, on `visibilitychange` to visible (throttled to once per 30 s), after local changes (debounced 3 s), and via a manual "Sync now" button. Skipped when offline or signed out; changes accumulate locally and sync later.

1. Find the file in `appDataFolder` by name (cache `fileId` in sync-meta). If absent, create it with the local state and finish.
2. Download the remote JSON; validate with zod (on invalid/corrupt, do **not** overwrite; surface an error and keep local state).
3. `merged = merge(local, remote)`; save `merged` locally.
4. If `merged` differs from remote, upload it (PATCH media upload to the same file).
5. Update `lastSyncedAt`. On HTTP 401, drop the token and fall back to the signed-out state. On other errors, retry with backoff (max 3 attempts), then show "Sync failed" in Settings.

There is no server-side locking. Concurrent syncs from two devices are resolved by the next sync's merge; because merge is idempotent and monotonic, no data is lost except last-writer-wins on the same item.

### 6.4 UI surface
Status chip in the header: Synced (time), Syncing, Offline, Not signed in, Error. Details in Settings.

---

## 7. RetroAchievements integration

### 7.1 Purpose
For steps with `achievementIds`, show the achievement's icon, title, points, and whether the user has earned it (softcore/hardcore). This is **informational only**: it never changes check state.

### 7.2 API
- Endpoint: `GET https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?y=<WEB_API_KEY>&u=<USERNAME>&g=<raGameId>`
- Required params: `y` (web API key), `g` (game ID). `u` is the target username/ULID. Optional `a=1` includes award metadata (not needed).
- The response includes an `Achievements` object keyed by achievement ID. Per achievement, use: `Title`, `Description`, `Points`, `BadgeName`, and the earned dates (`DateEarned` / `DateEarnedHardcore`, present only when earned). Also read game-level `Title`, `ConsoleName`, `ImageIcon` if present (all optional in the UI).
- Badge image URL: derive from `BadgeName` (pattern `https://media.retroachievements.org/Badge/<BadgeName>.png`).
- **VERIFY** (Milestone 0): exact field names and casing against a real response, the badge URL pattern, and whether the API allows browser **CORS** requests from the GitHub Pages origin.
- **CORS fallback:** if browsers are blocked, add a minimal Cloudflare Worker (or equivalent) proxy that forwards the request and adds CORS headers. Keep the proxy URL configurable (`VITE_RA_PROXY_URL`). The user's API key is sent by the client to the proxy as a query parameter or header and must not be logged or stored by the proxy.

### 7.3 Credentials
- Settings screen has fields for RA username and Web API key (from the user's RA control panel).
- Stored in `localStorage` on that device only. **Never** synced to Drive, never committed, never logged. Mask the key in the UI after entry.
- All RA features are hidden/disabled gracefully when credentials are missing or a checklist has no `raGameId`.

### 7.4 Caching
- Cache the parsed response per `raGameId` in `localStorage` with a timestamp.
- On opening a game: show cached data immediately, then refresh if older than 5 minutes (and online). Provide a manual refresh button in the game header.
- Offline or API error: use cache, show a small "RA data may be stale" indicator; never block the checklist.

### 7.5 Display
- Step row: if it has `achievementIds`, show a compact chip per achievement (icon + title). Tapping opens a bottom sheet with description, points, earned state/date, and a link to `https://retroachievements.org/achievement/<id>`.
- If an achievement is earned on RA but its step is unchecked, show a subtle "earned on RA" marker (no auto-check).
- Game header: RA progress summary (earned / total achievements) when data is available.
- If an ID in a step isn't found in the response, show the raw ID with a link; do not error.

---

## 8. Progress logic (`progress.ts`, unit-tested)

For a checklist + game state, compute:
- `chapterProgress[chapterId] = { done, total }` using effectively-checked steps.
- `currentChapter` = first chapter with at least one unchecked step (or `null` if all done).
- `nextStep` = first unchecked step within `currentChapter`.
- `overall = { done, total }` across all current steps.
- `outOfOrder(stepId)` = true when the step is in a chapter **after** `currentChapter` (or in `currentChapter`, if you choose to also flag steps after an unchecked one; v1 flags chapter-level only).

---

## 9. UI / UX (phone-first)

General: mobile-first layout, minimum touch target 48 px, readable at arm's length, **dark theme by default (follows system)** since this is used next to a game, no hover-only interactions. Respect safe areas.

### 9.1 Library (home)
- List of games from the compiled checklists: title, console, overall progress bar and `done/total`, last opened. Sorted by last opened, then title.
- Header: sync status chip, Settings button.

### 9.2 Game view
- Sticky header: game title, overall progress, RA summary (if available), sync chip, refresh-RA button, menu (Reset, Keep screen awake toggle).
- **"Next up" card** at the top: the `nextStep` text and note, with a one-tap check button. When everything is done, show a completion state.
- Chapters rendered in order as collapsible sections with per-chapter progress. Default state: the current chapter expanded; completed chapters collapsed; later chapters collapsed. Remember expand/collapse state per game in localStorage.
- Step row: large checkbox, text, a chevron/button to reveal `note` if present, achievement chips if present. Tapping the checkbox toggles; tapping the text also toggles (configurable; default: checkbox and text both toggle, note button separate).
- After checking a step, show a toast with **Undo** (5 s). Un-checking is always just tapping the checked step again.
- **Out-of-order warning:** when the user checks a step for which `outOfOrder` is true, show a non-blocking banner/toast: "This is in a later chapter than your current one. Finish earlier chapters first to avoid missing something." Still allow the action.
- Floating "Jump to next step" button when the next step is off-screen.
- "Keep screen awake" toggle using the Screen Wake Lock API (re-acquire on visibility change).

### 9.3 Settings
- Google: sign in/out, account email, "Sync now", last synced time, error details.
- RetroAchievements: username, Web API key, "Test connection".
- Data: "Export state (JSON)" and "Import state (JSON)" as a manual backup (import merges via `merge`, not overwrite).
- About: app version, checklist versions.

### 9.4 Reset
Per-game "Reset checklist" with a confirm dialog that states it will uncheck all steps on all synced devices. Implemented as `resetAt = Date.now()`.

### 9.5 Rendering rules
- `text` and `note` are plain text; render with auto-linked URLs, preserve line breaks, escape everything else (no HTML injection).

---

## 10. PWA requirements
- Web manifest: name "RA Planner", standalone display, theme/background colors, 192/512 px and maskable icons.
- Service worker precaches the app shell and compiled checklist JSON so the whole app works offline after first load.
- `registerType: 'prompt'`: when a new version is available, show an "Update available — reload" toast. Checklists ship with deploys, so this is how new/edited checklists arrive on the phone.
- RA badge images and API responses: runtime cache (stale-while-revalidate) for images; API data is cached by the app itself (§7.4), not by the service worker.
- Must be installable on Chrome for Android (Pixel 8).

---

## 11. Build and deploy
- `pnpm dev` — checklist build in watch mode + Vite dev server.
- `pnpm build` — validate checklists, compile, then `vite build`.
- `pnpm validate` — schema validation only (used in CI and by the authoring agent).
- `pnpm test` — Vitest.
- GitHub Actions (`deploy.yml`): on push to `main`, run `pnpm install --frozen-lockfile`, `pnpm test`, `pnpm build`, deploy `dist/` to GitHub Pages. Set Vite `base` to the repo path (configurable via env).
- Environment: `VITE_GOOGLE_CLIENT_ID` (required for sync), `VITE_RA_PROXY_URL` (optional). Document setup of the Google Cloud project and OAuth client in `README.md` (create project, enable Drive API, create Web OAuth client ID, add authorized JS origins, publish consent screen).

---

## 12. Deliverable: `docs/CHECKLIST_AUTHORING.md`
A standalone instruction document that a user can paste to an AI agent along with a source guide (Google Sheet, GameFAQs-style page, forum post) to produce a valid checklist YAML. It must include:
1. The full schema from §4 with a complete example.
2. The ID stability rules from §4.2, including how to regenerate from an updated guide while preserving IDs (agent is given the existing file).
3. Chunking guidance: group steps into chapters so that **everything in a chapter should be done before moving to the next**; chapter boundaries should fall at natural points of no return (leaving an area, advancing a story flag, starting a new level, boss kills, etc.). Steps inside a chapter are listed in the order they should be done.
4. Step writing guidance: one actionable thing per step, short imperative text, put warnings and the "why" in `note`, and make sure missable items are placed **before** the point where they become unobtainable.
5. Achievement mapping: fill `achievementIds` only when the guide references the achievement or the mapping is unambiguous; leave blank otherwise.
6. Source handling: paraphrase the guide in the agent's own words rather than copying text verbatim, and record the guide's title and URL in `sources` (the repo may be public).
7. Verification: run `pnpm validate`, and `pnpm validate -- --against HEAD` when editing an existing checklist.

---

## 13. Testing and acceptance criteria

### Unit tests (Vitest)
- Schema: valid example passes; duplicate IDs, bad ID format, empty chapter, unknown keys, bad slug/filename fail.
- `merge`: commutative, associative, idempotent; uncheck on one device with a newer timestamp wins over an older check; reset wins over older checks and loses to newer checks; tie-break prefers unchecked; orphan IDs preserved.
- `progress`: current chapter, next step, per-chapter and overall counts, out-of-order detection, orphan IDs ignored.
- RA response parser: handles earned and unearned achievements, missing optional fields, unknown IDs.

### Manual acceptance (on Pixel 8 Chrome + desktop browser)
1. Install the PWA to the home screen; open with airplane mode on; checklists load and checking works.
2. Check items offline, go online, open the app; state appears on the desktop after "sync on open".
3. Uncheck an item on the phone; open the desktop; the item is unchecked there.
4. Check on both devices while offline, then sync both; the result contains both devices' changes.
5. Reset a game on one device; after sync the other device shows it reset; steps checked afterwards on either device remain checked.
6. A step with `achievementIds` shows icon/title/earned state when RA credentials are configured, and degrades gracefully without them, offline, or on API errors.
7. Re-deploying with a reworded step (same ID) keeps its check state; removing a step doesn't break the app.
8. Checking a step in a later chapter shows the out-of-order warning but still works; Undo works.

---

## 14. Milestones

**M0 — Spikes (do first; each produces a short note in `docs/spikes.md`)**
- Google sign-in + `appDataFolder` read/write from a static page on GitHub Pages, tested in installed-PWA mode on a Pixel 8; record silent re-auth behavior and consent-screen requirements.
- RA `GetGameInfoAndUserProgress` call from a browser: confirm field names, badge URL pattern, CORS. If blocked, scope the proxy.

**M1 — Core local app**: scaffold (Vite + Svelte 5 + TS), schema, checklist build script + validator, example checklist, state store + merge + progress with tests, Library and Game views, toggle/undo/out-of-order warning, reset.

**M2 — PWA**: manifest, icons, service worker, offline, update prompt, wake lock, deploy workflow to GitHub Pages.

**M3 — Drive sync**: auth, sync procedure, status chip, Settings sync section, export/import backup.

**M4 — RA integration**: credentials in Settings, API wrapper + cache, achievement chips and bottom sheet, game-level RA summary, graceful degradation (+ proxy if M0 requires it).

**M5 — Polish**: `docs/CHECKLIST_AUTHORING.md`, README (including Google Cloud setup), accessibility pass (labels, contrast, focus), run the full manual acceptance list.

---

## 15. Open risks
- Google token lifetime/re-auth friction on the phone (M0 spike).
- RA API CORS restrictions (M0 spike; proxy fallback defined).
- AI-regenerated checklists silently changing IDs and orphaning progress (mitigated by §4.2 rules and `validate --against`).
- Clock skew between devices affecting last-writer-wins (accepted for a single-user tool).

## 16. Possible future work (out of scope now)
In-app editing UI; auto-suggest "check this step" when the linked RA achievement is earned; multiple playthroughs; per-step search; importing checklists from Drive.
