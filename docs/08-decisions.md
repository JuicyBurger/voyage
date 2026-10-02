# Decisions

These were agreed before coding, then followed in the functions. Later choices are listed at the end.

## Agreed up front

1. The app lives in `voyage-companion/`, next to the unrelated `kita-taichung/` project, which was not touched.
2. The database is Postgres. Local Supabase first. Hosted Supabase comes at deploy time.
3. A raid asks for the target crew first, then the code. The check order is: own team, wrong code (counts toward 3 strikes and a 30-second block), defender still safe, defender already raided the maximum times. A failure in that list does not use a raid.
4. Reset keeps the role tokens by default. A switch mints new QR codes. The MC token is always kept.
5. After End, the MC can still adjust until the reveal starts. Scores are snapshotted at the start of the reveal, not at End.
6. Ready locks the config numbers. Start is allowed only from ready. Names can still be edited in ready. Going back to setup unlocks the numbers.
7. Rehearsal is 4×. It scales the event clock, event durations, and raid immunity. The undo window and the wrong-code block stay in real time.
8. Firing an event that is already running restarts its timer.
9. Market Sale picks among parts that are in stock and still missing from at least one team.
10. Undo rules: a Flag cannot be undone once a raid has been used, undoing a doubled pass restores Double Profit, and undoing the part that finished a boat clears that rank and shifts later ranks up.
11. During Last Call, jobs and sales are still allowed. Raids are blocked. Storm blocks everything, including during Last Call.

## Other choices made while building

- A `requests` table holds `action_id`. One request can write several `actions` rows (a sale that also finishes a boat, a raid that logs both sides).
- Pause is `paused_at` not null. Status is `setup | ready | running | last_call | ended`.
- Every write locks the game row, then team rows. Two team rows are locked in id order so two raids cannot deadlock each other. Phase 6 moved the game lock to the very start of the request, ahead of the insert into `requests`.
- Auto-fire runs in the MC browser. It is not a server cron. The server still refuses a second fire of the same schedule line.
- On resume, `world_events.ends_at`, `teams.immune_until`, and `team_secrets.raid_blocked_until` are shifted by the real pause length, and that length is added to `paused_ms_total`.
- Errors come back as JSON (`ok: false`, `error_code`, `args`) instead of a raised exception, so the request row commits and a retry of the same `action_id` returns the same error.
- Role tokens are per browser tab (`sessionStorage`), with `localStorage` and a cookie as fallback. A warning shows when another device for that role was seen in the last 90 seconds. Devices older than an hour are forgotten.
- Banners older than 15 seconds are skipped, so a phone waking from sleep does not replay them.
- The phone that caused a change refreshes itself at once.
- Team phones never render other teams' gold or points. The TV hides scores until the MC opts in, and it hides MC `adjust` lines so a private correction is not on the projector.
- `test_force_roll` in the config forces dice. The API refuses it unless `ALLOW_TEST_HOOKS=1`.
- Player text stays in `lib/copy.ts`.
- A team with 0 gold cannot be raided. After the code is confirmed, `start_raid` returns `NOTHING_TO_STEAL` and does not use a raid, a Shield, or the dice.
- Bounty targets are fixed when the MC fires it. The event stores those team ids. The bonus stays on the named teams for the whole event, even if someone else becomes richer.
