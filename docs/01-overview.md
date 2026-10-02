# Overview

Voyage Companion is the bookkeeping app for a live team game played in one room. People do the challenges in person. The app only tracks gold, boat parts, items, jobs, raids, world events, the event clock, and the score.

## Who uses it

- 5 teams, one phone each. A team can arm Double Profit and start a raid. Everything else on that phone is read-only.
- 5 posts (Shipwright, Sailmaker, Cartographer, Harbor Inn, Blacksmith). A post records jobs and sales.
- 1 MC, with the clock, the events, and the power to fix any number.
- An optional TV at `/screen/[gameCode]`. It needs no login and it never shows raid codes.

The game lasts 45 minutes on an event clock. Minute 0 to 5 is the story. Play runs from minute 5 to minute 40. Minute 40 to 45 is Last Call and the final reveal. Tapping Start sets the clock to 5:00.

## Stack

- Next.js 16 (App Router, TypeScript) on Vercel Hobby.
- Supabase: Postgres for the rules, Realtime for the phones.
- shadcn/ui (the "base-nova" style, which uses Base UI, not Radix) and Tailwind v4.
- Allowed libraries only: `@supabase/supabase-js`, `zod`, `qrcode.react`, `motion`, `canvas-confetti`.
- Sounds come from the Web Audio API. Vibration uses `navigator.vibrate`.

These were kept out: a game engine, Redux, an ORM, Socket.io, a separate backend, user accounts, and Supabase Auth.

## How a change moves

1. The phone sends `POST /api/action` with `{ type, action_id, ... }` and a role token in the `x-role-token` header. The MC setup page uses `x-admin-password` instead.
2. The route handler looks up the token, checks the role, and validates the body with zod.
3. One Postgres function does the whole action in one transaction. It locks the game row, then the team rows, checks the rules, writes the change, and writes a log row.
4. Supabase Realtime pushes the changed rows. Every phone subscribed to that `game_id` updates.

The browser never decides gold, dice, stock, or the clock. Every API response includes `server_now`, and the phones keep an offset from that.

## Where the rules live

All game rules are plpgsql `SECURITY DEFINER` functions in `supabase/migrations/`. Defaults live in `default_config()` and in the `config` jsonb column on the game. Functions read numbers from that config. They do not hard-code prices or limits.

| Migration | What it adds |
| --- | --- |
| `20261001000001_schema.sql` | Tables |
| `20261001000002_rls_realtime.sql` | Row security and the Realtime publication |
| `20261001000003_helpers.sql` | Defaults, idempotency, tokens, play reset |
| `20261001000004_setup_functions.sql` | Create game, setup, reset, whoami |
| `20261001000005_play_functions.sql` | Clock, prices, jobs, sales, undo, line status, Double Profit |
| `20261001000006_raids.sql` | Raid codes and `start_raid` |
| `20261001000007_events_mc.sql` | World events, price dial, MC adjust |
| `20261001000008_scoring.sql` | `game_scores` and the reveal |
| `20261001000009_rehearsal.sql` | The 4× rehearsal switch |
| `20261001000010_lock_order.sql` | Game-row lock before the request insert |

## Security shape

- Row level security is on for every table. The anon key can `SELECT` public tables only: `games`, `teams`, `posts`, `stock`, `job_counts`, `world_events`, `actions`, `raids`.
- `team_secrets` (raid codes), `role_tokens`, and `requests` have no anon policy. A phone gets its own raid code only through `get_my_raid_code`.
- Insert, update, and delete are revoked from anon. Writes go through the API with the service role key. That key stays on the server.
- `current_prices` and `game_scores` are the only functions granted to anon. They read public data.

## Player-facing text

Every sentence a player sees is in `lib/copy.ts`, so it can be translated later. The English is short and plain.
