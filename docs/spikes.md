# Milestone 0 spike notes

This is the remaining unverified item from the spec. It requires RA credentials and a deployed origin. Code paths are implemented defensively, but the notes below must be confirmed in the real environment.

Status: **not yet verified** (needs owner credentials + Pixel 8 / deployed origin).

---

## 1. RetroAchievements browser API call

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

When this spike is resolved, update this file with date, environment, result, and any code changes. If RA field names differ from the parser's assumptions, add fixtures to `tests/ra.test.ts` so the parser behavior is locked in.
