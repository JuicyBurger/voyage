# Phase 1: foundation

This phase put the project skeleton in place and proved that a phone can join with a QR code and land on the right empty screen.

## What was built

- A Next.js 16 app in `voyage-companion/`, with shadcn/ui components (button, card, badge, dialog, sheet, tabs, table, input, input-otp, progress, sonner, switch, separator, skeleton, label, textarea).
- Local Supabase through the CLI and Docker. The API is at `http://127.0.0.1:54321`. The database is on port `54322`. Studio and several extra containers are left off when starting, to keep the machine lighter: `npx supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor`.
- Migrations for the tables, row security, Realtime, and the setup functions.
- `supabase/seed.sql` creates the demo game `DEMOGM` with fixed role tokens.
- `/mc/setup`: password gate, create a game, edit team names and colours, post names and staff, the main numbers, and raw JSON. Reset asks you to type `RESET` and can mint new QR codes. The MC token is always kept.
- `/mc/qr`: 11 printable cards. The base URL is editable and remembered in `localStorage` under `vc_qr_base`.
- `/join/[token]`: stores the token, asks for a **Start** tap (this unlocks sound and the screen wake lock), then routes to `/team`, `/post`, or `/mc`.
- Empty role pages that show who you are. `/screen/[gameCode]` was a placeholder until Phase 5.
- `POST /api/action`: one route, a handler map, zod per action type. Password comparison uses a timing-safe equal. A repeated `action_id` returns the first result.

Shared pieces that later screens still use:

- `lib/role-storage.ts`. The token is saved in `sessionStorage` first, then `localStorage`, then a `vc_token` cookie. Session storage is per tab, so several roles can be open in one browser.
- `lib/server-time.ts`. Phones track the server clock.
- `lib/use-game.ts`. Loads a game once, then subscribes to `postgres_changes` filtered by `game_id`. If the channel drops, the screen shows "Reconnecting…" and polls every 5 seconds.
- `lib/copy.ts`, `lib/colors.ts`, `lib/post-icons.tsx`, `components/game/role-gate.tsx`, `components/game/game-bar.tsx`.

## How it was tested

API checks for a missing token (401), the wrong role (403), bad input (400), a repeated `action_id`, and reset. In the browser: join, the setup form, and the QR sheet.

## Notes carried forward

- The dev server often lands on **port 3001**, because something else on this machine holds port 3000. Scripts read `SCENARIO_BASE_URL` from `.env.local` (set to `http://localhost:3001`).
- `npm run test:scenario` printed nothing from PowerShell. The working command is `npx tsx --env-file=.env.local scripts/scenario-test.ts`.
- A self-referential `--font-sans` made the UI fall back to a serif font. It now points at `--font-geist-sans`.
- Turbopack's workspace-root warning was fixed by setting `turbopack.root` in `next.config.ts`.
- The lint rule `react-hooks/set-state-in-effect` is off in `eslint.config.mjs`, because the screens read the role token from storage after mount.
