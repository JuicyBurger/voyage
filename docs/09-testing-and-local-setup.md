# Testing and local setup

## Run it

From `voyage-companion/`:

```bash
npm install
npx supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor
npx supabase db reset
npm run dev
```

If port 3000 is taken, Next.js moves to another port. This machine used **3001**. `.env.local` sets `SCENARIO_BASE_URL` to match. A full reset of Docker sometimes fails the first time with `error running container: exit 1`. Running `npx supabase db reset` again succeeded each time.

`db reset` replays every migration and `supabase/seed.sql`. That recreates the demo game.

The MC setup password is `MC_ADMIN_PASSWORD` in `.env.local`. Do not put the service role key in a `NEXT_PUBLIC_` variable.

## Demo logins

After a reset, the game code is `DEMOGM`. Open these and tap Start. Replace the port if your dev server printed a different one.

| Role | URL |
| --- | --- |
| MC | `http://localhost:3001/join/demo-mc-000000000000000000000` |
| Team 1, Bears | `http://localhost:3001/join/demo-team-1-00000000000000000000` |
| Team 2, Magpies | `http://localhost:3001/join/demo-team-2-00000000000000000000` |
| Team 3, Pangolins | `http://localhost:3001/join/demo-team-3-00000000000000000000` |
| Team 4, Macaques | `http://localhost:3001/join/demo-team-4-00000000000000000000` |
| Team 5, Pheasants | `http://localhost:3001/join/demo-team-5-00000000000000000000` |
| Shipwright | `http://localhost:3001/join/demo-post-shipwright-0000000000000000` |
| Sailmaker | `http://localhost:3001/join/demo-post-sailmaker-0000000000000000` |
| Cartographer | `http://localhost:3001/join/demo-post-cartographer-0000000000000000` |
| Harbor Inn | `http://localhost:3001/join/demo-post-inn-0000000000000000` |
| Blacksmith | `http://localhost:3001/join/demo-post-blacksmith-0000000000000000` |
| TV | `http://localhost:3001/screen/DEMOGM` |
| QR sheet | Join as the MC first, then open **QR codes**, or go to `/mc/qr` in that same browser |

Each browser tab keeps its own role. You can have the MC, a post, and a team side by side.

Phones on the Wi-Fi cannot open `localhost`. On the QR page, set the link address to this computer's Wi-Fi address before printing.

## Automated tests

The dev server has to be running. Both scripts talk to the real API and a real database. They create their own games. They do not change `DEMOGM`, except that a later `db reset` wipes everything.

```bash
npx tsx --env-file=.env.local scripts/scenario-test.ts
npx tsx --env-file=.env.local scripts/load-check.ts
```

Last green run, at the end of Phase 6:

- Scenario: **127 passed, 0 failed.** Jobs, stock, undo, boats, pause, raids (forced dice, Shield, tie, wrong codes, Last Call), every world event, the price dial, MC adjust, the 123-point score, the most-raids bonus, the reveal lock, idempotency, and rehearsal timing.
- Load: two identical requests at once pay once. 100 jobs across five posts succeed. The extra wave is `JOB_LIMIT`. Five Hull purchases at once sell exactly 3 and leave stock at 0. Every team's gold equals 30 plus its log.

`ALLOW_TEST_HOOKS=1` is set locally so the scenario script can pass `test_force_roll`. Leave that unset on the live Vercel project.

## What the hidden test browser could not show

The Cursor browser panel often runs the tab as hidden. Chrome then delays timers, so banners and screenshots can lag even when the page text and the database are already right. Anything that depends on a 2-second animation was confirmed from the page text, and the visual pass was left for a normal visible window or a phone.
