# Phase 4: events and the MC panel

This phase gave the MC every world event, the price dial, the teams table, and the activity feed. Timed events end by themselves. The MC can stop one early.

## What was built

`20261001000007_events_mc.sql`:

- `fire_event`. Gold Rush, Storm, Supply Ship, Lighthouse Aid, Market Sale, Pirate Hour, Bounty, a custom message, and Last Call.
  - Firing a timed event that is already running ends the old one and starts the timer again.
  - A line from the schedule can fire only once (`schedule_index`). Two MC tabs cannot double-fire the same minute.
  - Nothing can be fired while paused, or before the game is running.
  - Market Sale picks a part that is in stock and still missing from at least one team.
  - Lighthouse Aid pays the poorest team. Every team tied for poorest gets it.
  - Bounty names the richest team (every team tied for richest).
  - Supply Ship adds `supply_ship_add` to every part.
  - Last Call from this function also sets the game status, same as the clock button.
- `cancel_event`. Stops a running timer. The event still counts as fired, so auto-fire will not fire it again.
- `set_price_dial`. Off, or minus or plus the configured percent (default 20). Turning it on during play sends a banner.
- `mc_adjust`. A reason is required. Gold is a delta and cannot go below 0. Parts, Flag, Sword, Shield, raids left, and raid wins are set to a new value. Giving or removing a part runs `_sync_boat`, which finishes or un-finishes the boat and shifts ranks. Adjusting is refused once the reveal has started.
- `set_option`. `auto_fire` and `show_scores_on_tv`. Rehearsal was added in Phase 6.

On every screen:

- A 3-second banner for each event (`bannerFor` in `lib/copy.ts`).
- A coloured countdown strip in the top bar for each running event, plus a price-dial strip. Strips freeze while the game is paused.
- Team and post phones get a full-screen Storm cover with a countdown. Jobs, sales, and raids are rejected until it ends.

The MC panel (`app/mc/page.tsx`) was filled in:

- Clock buttons: Ready, Start, Pause / Resume, Last Call, End (with a confirm).
- **Next event**, with Fire now. When the clock has passed that minute the card highlights "Due now". At minute 40 it flashes "Time for Last Call".
- The schedule, with fired lines ticked.
- Auto-fire. It runs in the MC's browser. Each line uses a deterministic request so a refresh does not fire twice. A network failure is allowed to retry. The server still refuses a second fire of the same line.
- Event buttons with a live countdown and Stop, a custom message box, and the price dial.
- Teams table: gold, parts, items, raids left, raid wins, times raided, safe countdown, boat rank. Tap a row to open the adjust dialog. The live points column was added in Phase 5.
- Stock with live prices, and a 5 by 5 job grid plus who each post is serving and how many are waiting.
- Pace check against the config numbers at minutes 15 and 25.
- Activity feed of the latest 50 actions, including raids and MC fixes.

## How it was tested

The scenario script covered Gold Rush (a Sailmaker pass pays 17, or 34 with Double Profit), Storm (jobs refused, then allowed after the short test storm), Supply Ship, Lighthouse Aid, the price dial at −20% / +20% / off, Market Sale, Pirate Hour plus Bounty (steal 40, then capped at the defender's gold), restarting and stopping a timer, a schedule line that cannot fire twice, the custom message, MC adjust (including finishing and un-finishing a boat), and Last Call.

In the browser, Gold Rush and Market Sale showed countdown strips. A Storm covered the Bears' phone with "Wait 0:53". Adjusting the Bears by +5 with a reason wrote the log line "MC: Bears gold +5".

The test browser's screenshots lagged behind the page text, the same hidden-tab timer issue as Phase 2. The page text and the database were used when a screenshot was stale.

## Notes

Auto-fire needs the MC's browser to stay open. If that phone sleeps, scheduled events wait until it wakes or someone taps Fire now.
