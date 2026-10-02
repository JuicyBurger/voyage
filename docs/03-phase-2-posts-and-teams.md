# Phase 2: posts and teams

This phase made the posts the source of truth for jobs and sales, and gave each team a live phone.

## What was built

Database functions in `20261001000005_play_functions.sql`:

- `record_job`. Pass pays the post's job pay. Fail pays `fail_pay` and still counts toward the limit. Gold Rush adds its bonus on a pass only. Double Profit doubles a pass (including the bonus) and is then used. A fail does not use it. The 5th job at the same post is `JOB_LIMIT`.
- `buy_item`. A post can sell only its own items. Parts check stock, ownership, and gold. The price is the base, then the price dial (rounded), then Market Sale, and never below 1. A Flag gives the configured number of raids. A Sword is once per team. A Shield can be held once at a time. Completing all four parts sets `boat_done_at`, assigns `boat_rank`, writes a `boat_finished` world event, and logs `boat_done`.
- `undo_last`. This post's last job or sale, within 2 real minutes. It reverses gold, the job count, Double Profit, parts, and stock. A Flag that has already been used in a raid cannot be undone (`UNDO_FLAG_USED`). A used Shield cannot be undone. If the team has spent the gold, the post is told to ask the MC (`UNDO_NO_GOLD`). Undoing the part that finished a boat clears that rank and shifts later ranks up, and cancels the `boat_finished` event.
- `set_serving`, `set_waiting` (0 to 99), `arm_double`.
- `game_control` was brought forward from Phase 4 so a game could actually be started: ready, unready, start, pause, resume, last_call, end. Resume pushes event end times, immunity, and the wrong-code block forward by the pause length. The event clock ignores paused time.

Screens:

- **Post** (`components/post/post-screen.tsx`). Five team buttons. The selected team shows gold, parts, a pulsing "DOUBLE PROFIT ARMED" badge, Pass and Fail with the live amount, and a sell list with price, stock, and why a button is grey. Undo lasts 2 minutes. Serving is set when a team is picked, with Done to clear it. A waiting stepper. The post's rule text comes from config.
- **Team** (`components/team/team-screen.tsx`). Big gold, a one-sentence next step, the boat, items, the Double Profit toggle, the five posts (jobs left, free / busy / serving you, waiting), and the journey log.
- **Banner** (`components/game/event-banner.tsx`). A full-screen banner for 3 seconds, with confetti and a tune for a finished boat. A phone that wakes up does not replay banners older than 15 seconds.
- The phone that just acted calls `refresh()` immediately, instead of waiting for Realtime to echo the change.

`scripts/scenario-test.ts` started here and checked jobs, the job limit, Double Profit, undo, undo after the gold was spent, the finished boat, pause, and "gold equals 30 plus the log".

## How it was tested

The scenario script, then a browser pass: a post Pass updated the team tab, the next-step hint changed, an armed Double Profit doubled a pass, and a boat completed.

The full-screen banner was hard to watch in the embedded test browser. That panel runs with `visibilityState` hidden, and Chrome slows timers in hidden tabs. A Node probe saw Realtime arrive in about half a second, so the delay was the hidden tab, not the app. The banner was left for a normal visible tab.

## Notes

Gold Rush, Storm, and the price dial were already applied inside the SQL. There was no button to fire them until Phase 4.
