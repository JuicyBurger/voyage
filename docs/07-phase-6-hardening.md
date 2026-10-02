# Phase 6: hardening

This phase added rehearsal, proved the app under a burst of writes, fixed a deadlock the burst found, and replaced the stock Next.js README.

## Rehearsal

`20261001000009_rehearsal.sql` extends `set_option` with `rehearsal`. Turning it on sets `games.speed` to 4. Turning it off sets speed back to 1. It is allowed only in `setup` or `ready`. After Start the API returns `REHEARSAL_LOCKED`.

`_event_ms` and the client `eventMs` both multiply elapsed time by `speed`. `_real_interval` divides event minutes by `speed`, so a 2-minute Gold Rush lasts 30 real seconds, and 3 minutes of raid immunity last about 45 real seconds. Undo stays `interval '2 minutes'`. The wrong-code block stays `interval '30 seconds'`. Pause length is real time and is applied the same way.

`RehearsalMark` is a pink strip: "REHEARSAL · the clock is 4× faster". It sits on the normal top bar, on the Storm cover, and on the reveal, so it stays visible when those covers take the screen.

The MC switch is next to the clock buttons. It is disabled once the game has started. Reset does not clear the switch, so a practice reset stays fast until someone turns it off.

Postgres `numeric` and `bigint` can arrive in the browser as strings. `eventMs` now coerces `speed` and `paused_ms_total` with `Number(...)`.

## The deadlock

`scripts/load-check.ts` fires every post at every team at once. The first run failed with `deadlock detected`, even though gold still matched the log (the failed transactions rolled back).

The cycle was a lock order bug. Inserting a row into `requests` takes a shared key lock on the game, because `requests.game_id` is a foreign key. The action then waits for `SELECT ... FOR UPDATE` on that same game row. Two actions each held the shared lock and each waited for the exclusive lock.

`20261001000010_lock_order.sql` changes `_begin_request` so it locks the game row first, then inserts the request. Actions on one game wait in a queue instead of deadlocking. `create_game` still passes a null game id, so that path does not try to lock a row that does not exist yet.

After the fix the load check passed:

- Two copies of the same `action_id`, sent together, both returned success and the team was paid once (30 + 10 = 40 at the Inn).
- Four waves of 25 jobs (5 posts × 5 teams) all recorded.
- A fifth job at every post returned `JOB_LIMIT`.
- Five teams bought a Hull at once. Stock started at 3. Exactly 3 sales succeeded and stock ended at 0.
- Every team's gold equalled 30 plus the sum of its log.

## What was already in place

These were built in earlier phases and checked again rather than rewritten:

- Idempotency. `_begin_request` inserts the `action_id`. A second call returns the stored result. The client retries a dropped network request with the same id (`lib/api.ts`, three attempts).
- Reconnect. `useGame` shows "Reconnecting…" when the channel is not `SUBSCRIBED`, polls every 5 seconds until it is back, refetches when the tab becomes visible, and pings the server every 60 seconds to keep the clock offset fresh.
- Wake lock. `requestWakeLock` runs from the Start button and from `RoleGate` and the TV. The browser drops it when a tab hides, so it is requested again on `visibilitychange`. If the device refuses, the app stays quiet.

## README

The create-next-app README was replaced with `voyage-companion/README.md`: local Supabase, env vars, `db push` to a hosted project, Vercel, printing QR codes, rehearsal, and the event-day list. That list says to open the app the day before and on the morning, because a free Supabase project pauses when it is unused.

## How it was tested

- Scenario script: **127 passed, 0 failed**, including the new checks (same `action_id` pays once, rehearsal refused after Start, speed 4, Gold Rush 30 real seconds, immunity about 45 real seconds, wrong-code block still about 30 real seconds).
- Load check: passed, as above.
- In the browser, turning rehearsal on for `DEMOGM` showed the pink strip on the MC panel at 5:00, still in setup.
- The demo database was reset afterwards, so `DEMOGM` is a fresh setup with rehearsal off.
