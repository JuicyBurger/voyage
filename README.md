# Voyage Companion

The bookkeeping app for a 45-minute in-person pirate team game. Five teams, five posts, one MC and an optional TV share one live game: gold, boat parts, jobs, raids, events and the score.

Phones never write to the database directly. They read through Supabase Realtime and send every change to `POST /api/action`. Postgres functions apply the rules.

## What you need

- Node.js 20 or newer
- A [Supabase](https://supabase.com) project (free plan is enough)
- A [Vercel](https://vercel.com) project (Hobby plan is enough)
- For local development: Docker, so the Supabase CLI can run Postgres

## 1. Run it on your computer

```bash
npm install
npx supabase start
npx supabase db reset
```

`npx supabase status` prints the local URL and keys. Copy `.env.example` to `.env.local` and fill it in:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY= # sb_publishable_… from supabase status
SUPABASE_SECRET_KEY=                  # sb_secret_… from supabase status. Server only.
HOST_PASSWORDS=                       # comma-separated host passwords that may create games
ALLOW_TEST_HOOKS=1                    # local only. Lets the test script force dice.
SCENARIO_BASE_URL=http://localhost:3000
```

`npx supabase status -o env` prints `PUBLISHABLE_KEY` and `SECRET_KEY`. Put those values in the env vars above. Do not put the secret key in a `NEXT_PUBLIC_` variable.
Then:

```bash
npm run dev
```

Open http://localhost:3000. If that port is taken, Next.js prints another one. Use that port in the browser and in `SCENARIO_BASE_URL`.

`db reset` loads a demo game called **DEMOGM** with fixed logins:

| Role | Open |
| --- | --- |
| MC | http://localhost:3000/join/demo-mc-000000000000000000000 |
| Bears (team 1) | http://localhost:3000/join/demo-team-1-00000000000000000000 |
| Shipwright | http://localhost:3000/join/demo-post-shipwright-0000000000000000 |
| TV | http://localhost:3000/screen/DEMOGM |

Teams 2–5 and the other posts follow the same pattern (`magpies` is slot 2, post kinds are `sailmaker`, `cartographer`, `inn`, `blacksmith`). Tap **Start** on each join page.

## 2. Put it on Vercel

1. Create a Supabase project in **Singapore or Tokyo** (the players are in Taiwan).
2. From this folder, with the [Supabase CLI](https://supabase.com/docs/guides/cli) logged in:

   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   The migrations create the tables, the rules, the row security and the Realtime publication. Realtime is on for `games`, `teams`, `posts`, `stock`, `job_counts`, `world_events`, `actions` and `raids`. Raid codes and role tokens are not readable by phones.

3. Import the repo into Vercel. Set these environment variables. Do **not** set `ALLOW_TEST_HOOKS` on the live site.

   | Name | Where it is used |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Browser and server |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser `apikey` header (`sb_publishable_…`) |
   | `SUPABASE_SECRET_KEY` | Server writes only (`sb_secret_…`). Never prefix it with `NEXT_PUBLIC_`. |
   | `HOST_PASSWORDS` | Server only. Comma-separated passwords that may create a game. |
   | `SUPABASE_JWT_SIGNING_KEY` | Server only. Private JWK JSON used to mint per-game read passes (same key as `supabase/signing_keys.json`). |

   Use long random host passwords (for example 24+ characters). Removing a password from the list revokes it.

   **Signing keys file:** local `db reset` / hosted `db push` reads `supabase/signing_keys.json` when `signing_keys_path` is set in `config.toml`. Run those commands from a machine that has that file (it is gitignored). On a hosted project, import that same JWK under **JWT signing keys**, then **Rotate** it to current before phones can use read passes.

4. Deploy, then open `https://YOUR-APP.vercel.app/` and host a game with a host password.
Free Supabase projects pause after a period with no traffic. **Open the app the day before the event, and again on the morning.** A paused project takes a minute to wake, which you do not want at the start of the game.

## 3. Create a game and print the cards

1. Open `/` and choose **Host a game** (phase 2). For now, create a game through the API with `HOST_PASSWORDS`, or use the demo game after `db reset`.
2. Create a game. Set the team names, colours and post staff names, then **Save**.
3. Open **QR codes**. Set the base URL to the public site (not `localhost`) and print the sheet. One card per phone: 1 MC, 5 teams, 5 posts.
4. Each person scans their card, taps **Start**, and stays on that page. Start turns on sound and keeps the screen awake.
5. On the MC panel, tap **Ready**, then **Start game** when the story ends. The clock begins at 5:00.

Scanning the same card on a spare phone works if a phone dies. Both phones can act. Each one shows a small warning.

## 4. Run a rehearsal

On the MC panel, before Start, turn on **Rehearsal**. Every screen shows a pink **REHEARSAL** strip and the clock runs four times faster, so a full game takes about 10 minutes. Event lengths and raid immunity speed up with it. The 2-minute Undo window and the 30-second wrong-code wait stay in real time.

Turn the switch off before the real game. You can only change it while the game is in setup or ready. **Reset game** on the setup page keeps the switch where it is, so turn it off after a practice run.

## 5. On the day

- Morning: open the site, confirm it loads, and create the real game with Rehearsal **off**. Print fresh QR cards if you have not already.
- Check the venue Wi-Fi with one phone: scan a card and confirm the MC clock appears.
- Give each post its card and each team its phone. The TV opens `/screen/YOURCODE` (the six-letter code is on the QR page). Tap the TV once so banners can play sound.
- MC: **Ready**, then **Start game** at the end of the story.
- At minute 40 the panel flashes **Time for Last Call**. Tap it. Posts can still serve the teams in line. No more raids.
- After Last Call, posts can still record jobs and sales until the MC taps **End**. End the game at about minute 41.
- **End game**, then **Start the reveal**. Tap through the places from last to first. The TV and every phone follow.
- Keep a paper record of gold. The app has no offline mode. If the MC panel says **Reconnecting…**, it keeps trying and polls every 5 seconds until Realtime is back.
- A post can Undo its last job or sale for 2 minutes. After that, tap the team in the MC table, change the number and write a reason.
- **Auto-fire** fires the scheduled events from the MC's own browser. Leave it off if you want to fire each one yourself. The list on the panel tells you when each one is due.

## Tests

The dev server must be running.

```bash
npx tsx --env-file=.env.local scripts/scenario-test.ts
npx tsx --env-file=.env.local scripts/load-check.ts
```

The scenario script checks the game rules, including the worked example from the design (4 parts, first boat, 42 gold, no raid wins = 123 points). The load script fires all five posts at once and checks that gold still matches the log.
