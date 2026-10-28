# Leaderboard (Cloud Firestore)

Firebase project `fury-survivors` (owner leinstay@gmail.com), web app in it, database `(default)`.

Anonymous online top-10. Client not authorized, only defense is `firestore.rules`. Architecture from Fruit Madness (`.claude/docs/leaderboard.md` there). Game works fully offline.

## Security

Never run `gcloud`, `firebase` CLI or anything that touches Google accounts. Owner manages Firebase console by hand. Rules don't deploy automatically.

## What where

| File | What |
|---|---|
| `src/data/leaderboard.js` | FIREBASE_CONFIG (public), FIRESTORE_DB_ID, solo and co-op collections (`MODES`), nick, pair (`PAIR`), ip field (`IP_FIELD`), score formula, ranges, limits (readLimit, rows, cooldown, timeout) |
| `src/services/leaderboard.js` | service: `fetchTop10(mode)`, `submitScore(run, mode)`, `isOnline`, `topTen`, `rankOf`, `computeScore`, `fetchIp`, `__setBackendForTests`. No Phaser and DOM on import, SDK lazy-loaded via `src/services/firebase.js` from gstatic (12.19.0, firestore-lite) |
| `src/services/net.js`, `src/data/net.js` | co-op signaling: document `rooms/<code>` with offer/answer (see `docs/ARCHITECTURE.md`, "Network co-op") |
| `src/services/nick-store.js` | nick in localStorage, key `fury-survivors.nick` |
| `src/core/nick.js` | `validateNick`: 3-6 `[A-Za-z0-9]`, result uppercase. `pairName`, `validateName(raw, mode)` for co-op pair |
| `src/scenes/Leaderboard.js` | top-10 scene (LOADING / OFFLINE / empty / table), Solo and Co-op tabs, entry from menu |
| `src/ui/results.js` | results screen: score, DOM nick field over canvas, Submit, status and rank |
| `firestore.rules` | database rules, published by hand |

Service errors (`Error.message`): `offline` (no network, SDK didn't load, 8 s timeout), `cooldown` (submit before 10 s after last), `invalid` (nick or numbers failed local check), `denied` (rules rejected).

## Data

- Project `fury-survivors`, database `(default)` (`FIRESTORE_DB_ID = null`), collections `fury_scores` (solo) and `fury_scores_coop` (co-op, separate table). Player codex in `fury_codex/{id}` (backup, see `docs/ARCHITECTURE.md`, "Codex"). Telemetry for balance in `fury_runs` (each run of each player, write only, read open. Parse: `node tools/runs-report.mjs`).
- Document: `{ name, score, time, kills, level, victory, difficulty, hero, stage, ip, createdAt }`. `hero` is hero id (co-op is `'heroine+mage'`), `stage` is zone id (`'forest'`). Records without them read as `heroine` and `forest`. Rules allow absence. `time` whole seconds, `createdAt` server time, `difficulty` `'normal' | 'cursed'` (`src/data/difficulty.js`). Records without field (before difficulty) read as `normal`. Rules allow absence.
- `name`: nick in solo, pair `HOST+GUEST` in co-op (host first. Same pair with other nicks is different record). Either can submit. Pair's best record stays.
- `ip`: submitter public IP (request to `api.ipify.org` on submit, up to 3 s. Failed means no field). On `topTen` read first keeps best record per IP (any nick), then best per name. Records without `ip` (old) only second check.
- Co-op lobby: collection `rooms`, document per lobby (id = 5-char code): `{ offer, createdAt }` written by host, `{ answer, answeredAt }` once added by guest. Host deletes document after connect. Abandoned lobbies can clean with TTL policy by `createdAt` (Firestore > TTL, optional).
- Formula: `score = floor(floor(time) * 10 + kills * 1.5 + coins * 15 + (victory ? 5000 : 0))` (from 27.10.2026 kill and coin x1.5) (coins now buy nothing, score only), numbers in `SCORE_FORMULA`. Rules check only ranges, not formula match. Can change formula without publishing rules. Client can send any numbers in range (no forgery protection, like Fruit Madness).
- Query: `orderBy('score','desc').limit(50)`, then `topTen` keeps each player's best (nick case-insensitive) and cuts to 10. Index automatic.
- Ranges (duplicate in `LIMITS` and rules): score 1..9999999, time 0..86400, kills 0..1000000, level 1..999.
- Run with 0 score can't submit (rules need score > 0). Submit disabled.

## Nick input

DOM `<input>` made over canvas when opening GameOver/Victory, removed on scene exit. Position from canvas `getBoundingClientRect`, `autocapitalize="characters"`, `maxlength=6`, latin letters and digits only, case auto-raised. Field keys don't reach Phaser (WASD, Space, Esc). Esc or Enter in field: Esc unfocuses, Enter submits. From gamepad: A on field focuses it, A on Submit submits (with saved nick, focus goes straight to Submit). One successful submit per run. On error, retry possible.

## Console setup (by hand, no CLI)

Create database:
1. <https://console.firebase.google.com>, account leinstay@gmail.com, project `fury-survivors`.
2. Databases & Storage > Firestore > **Create database**.
3. Edition: **Standard**. Leave Database ID as **`(default)`**: game uses exactly that.
4. Location: **eur3 (Europe)**. Can't change later.
5. Mode: **Production mode** (all closed until rules published). Create.

Rules:
1. Firestore > tab **Rules**.
2. Replace full content with text from `firestore.rules` in repo > **Publish**.
3. Verification: run, nick, Submit. Collection `fury_scores` appears in Data with document. Menu Leaderboard shows row.
4. Co-op: after rules with `rooms` and `fury_scores_coop`, create lobby from menu Co-op. Second player enters by code. Collections appear on first write.

Don't make collections by hand. They appear on first write. Index for query is automatic.

Moderation: client can only create. Trash rows deleted by hand in console (Data, `fury_scores`, delete document).

Extended telemetry v2, data completeness and delivery queue: [TELEMETRY.md](TELEMETRY.md).
