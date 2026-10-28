# Firestore: what's stored, what to clean, when

Project `fury-survivors` on free Spark tier. Limits: 1 GiB storage, 50,000 reads per day,
20,000 writes and 20,000 deletes, 10 GiB outbound per month. TTL policies (auto-delete by time field) don't work on Spark. They need billing. So cleanup is ours: part from game, the rest from script
`tools/firestore-cleanup.mjs`.

## Collections

| Collection | What | Size | Growth | Policy |
|---|---|---|---|---|
| `fury_runs` | run telemetry, document per player | 150–200 KB | each run from 30 s | 30 days, then local archive and delete |
| `rooms` | co-op lobby, offer/answer | 5–20 KB | each lobby | game deletes itself. Script clears old over 1 hour |
| `fury_codex` | codex backup | up to 800 KB, usually less | document per player, rewritten | don't clean (recover codex by id). Optional `--codex-days` |
| `fury_achievements` | player achievements (localStorage copy) | up to 100 KB, usually under 5 KB | document per player, rewritten | don't clean |
| `fury_inventory` | stash, bag, currency (localStorage copy) | up to 300 KB, usually ~60 KB | document per player, no faster than once per 60 s | don't clean |
| `fury_scores`, `fury_scores_coop` | leaderboards | < 1 KB | score submit | don't clean: negligible space |

Telemetry eats almost all space: 1 GiB is about 5–6 thousand runs. Everything else orders of magnitude less.

## What game does

- Host deletes room after guest replies, on cancel, and on tab close (`pagehide`, best effort).
- While host waits, it updates `aliveAt` every `ROOMS.beatMs`. Guest entering a room where host didn't mark for longer than `ROOMS.staleMs` deletes it and sees "lobby not found".

## When to run script

Once a week or when Firebase console (Firestore > Usage) reaches 70% space.

```
gcloud auth login                               # account owner of project, once
node tools/firestore-cleanup.mjs                # report: space and what would clean
node tools/firestore-cleanup.mjs --apply        # archive runs + delete
```

Flags: `--runs-days N` (run age), `--rooms-hours N`, `--codex-days N` (default 0, don't touch).
Run archive: `tools/out/firestore-archive/fury_runs-<date>.jsonl` (not in git). Parse balance with archive: `node tools/runs-report.mjs --archive`.

Quota per run: read each document of all collections (one read per document) and one delete per removed. Script downloads telemetry wholly. At full database roughly 1 GiB from 10 GiB monthly, so running weekly is unnecessary.
