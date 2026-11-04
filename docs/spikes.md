# Milestone 0 spike notes

These are the two unverified items from the spec. They require the owner's Google account, RA credentials, and a deployed origin. Code paths are implemented defensively, but the notes below must be confirmed in the real environment.

Status: **not yet verified** (needs owner credentials + Pixel 8 / deployed origin).

---

## 1. Google sign-in and `appDataFolder` from an installed PWA

### Questions to answer

1. How often does the phone PWA need interactive re-authorization in practice?
2. Does the OAuth consent screen need to be **In production** to avoid periodic re-consent?
3. Does the token model work in installed-PWA mode, or does Android Chrome treat it like a browser tab with a popup?
4. Does the silent request (`prompt: ''`) succeed on open after hours or days, without user interaction?
5. Does `drive.appdata` require verification, or only the standard non-sensitive-scope warning?

### Test procedure

1. Deploy the app to GitHub Pages over HTTPS.
2. Create the Web OAuth client ID with authorized JavaScript origins:
   - `http://localhost:5173`
   - `https://<owner>.github.io`
3. Complete the consent screen. Try both **Testing** and **In production**.
4. Install the PWA on the Pixel 8.
5. Sign in, then close the PWA completely.
6. Re-open after 5 minutes, 1 hour, 1 day, and 1 week. Record whether sync runs silently or the app shows "Not signed in".
7. Toggle airplane mode, check steps, go online, reopen. Confirm sync merges the offline changes.
8. Check whether the token is lost after an Android Chrome update or a PWA reinstall.

### What to record

- Date/time of each attempt.
- App state: installed PWA vs browser tab.
- Consent screen publishing status.
- Whether a popup opened, silently succeeded, or failed.
- Any error text from Settings → Error details.
- Whether the Drive file appeared in `appDataFolder` (the file is normally hidden; verify through the API or by the app's sync success).

### Current implementation expectations

- Scope: `openid email https://www.googleapis.com/auth/drive.appdata`.
- Token client: `google.accounts.oauth2.initTokenClient`, token kept in memory only.
- Silent refresh on open/visibility uses `prompt: ''`.
- Interactive sign-in uses `prompt: 'select_account'`.
- A local flag (`ra-planner:google:signed-in`) controls whether the app tries silently.
- On 401 the token is dropped and Settings shows the signed-out state.
- There is no refresh token; token lifetime is about one hour, and expiry is handled by a silent or interactive request.

### Likely outcome

`drive.appdata` is a non-sensitive scope. Verification is not expected to be required. Publishing to production is still recommended to avoid test-mode consent expiration and test-user limits.

---

## 2. RetroAchievements browser API call

### Questions to answer

1. Does `API_GetGameInfoAndUserProgress.php` allow browser CORS requests from the GitHub Pages origin?
2. What are the exact response field names and casing?
3. Is `Achievements` an object keyed by ID or an array?
4. Is the badge URL pattern `https://media.retroachievements.org/Badge/<BadgeName>.png` correct?
5. Are earned dates present only when earned, and what do unearned dates look like (`null`, `0000-00-00 ...`, absent)?
6. Does the API accept the Web API key as a query parameter from the browser, and does it rate-limit normal use?

### Test procedure

1. Configure RA credentials in Settings.
2. Add a real `raGameId` to a checklist.
3. Open the game with DevTools → Network filtering `retroachievements`.
4. Inspect the request status, response headers (`Access-Control-Allow-Origin`), and response body.
5. Confirm the achievement icon loads from `media.retroachievements.org`.
6. Mark one achievement earned and one unearned; confirm the chips and bottom sheet show the right state.
7. Block the request (DevTools offline) and confirm cached data still renders with a stale indicator.

### What to record

- Browser and origin.
- CORS result: direct success or blocked.
- A redacted JSON sample (remove the API key and any personal data) showing the actual casing of `Title`, `Description`, `Points`, `BadgeName`, `DateEarned`, `DateEarnedHardcore`, `NumAchievements`, and `Achievements`.
- Badge URL that actually loaded.
- Whether a proxy was required.

### Current implementation expectations

- Direct URL: `https://retroachievements.org/API/API_GetGameInfoAndUserProgress.php?y=...&u=...&g=...`
- Parser accepts PascalCase and camelCase keys.
- Parser accepts `Achievements` as an object or an array.
- Earned if a non-zero `DateEarned` / `DateEarnedHardcore` exists, or `Achieved` is truthy.
- Badge URL: `https://media.retroachievements.org/Badge/<BadgeName>.png`.
- If CORS is blocked, set `VITE_RA_PROXY_URL` to a minimal proxy (see README) and retest.
- The RA API key is sent as the `y` query parameter, including through the proxy. The proxy must not log request URLs.

### Likely outcome

CORS may be blocked for browser requests. If so, the optional proxy is the deployment path. The app already supports both direct and proxied modes.

---

## Follow-up

When these spikes are resolved, update this file with date, environment, result, and any code changes. If RA field names differ from the parser's assumptions, add fixtures to `tests/ra.test.ts` so the parser behavior is locked in.
