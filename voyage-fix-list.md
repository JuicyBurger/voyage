# Voyage: fix and improvement list

**Game:** https://voyage.kitataichung.org/  ·  **Compiled:** 9 Oct 2026, from 3 trial reports, the battle-trial notes and tester feedback in the room on 9 Oct.

Three trials so far. **Trial 1, PAQXPN** (3 Oct, about 13:40–14:35 Taipei) tested the basic loop with 2 teams and 3 posts. Neither ship was finished, and it ended at 43:07. **Trial 2, HLZVAH** (8 Oct, about 17:50–18:10) was a retest after fixes. Both ships were finished by about 15:05, before any event after minute 19, and raids and items weren't tested. **Trial 3, DDNGLR** (8 Oct, play about 23:22–23:51) tested the battle layer: Pandai Besi items, Pirate Flag raids, Sword and Shield. It also covered events from minute 19 to 27 and the new team/post on/off switches. Both ships were finished: Bears 127 pts, Magpies 110 pts, ended at 28:22. All testers were bots, one role per browser. Physical challenges weren't performed, so posts chose Pass/Fail at random. Times like `20:04` are game-clock mm:ss. Indonesian UI strings are quoted exactly, with a translation in brackets.

Bug IDs `B1–B28` refer to the trial 3 report (`voyage-battle/report.md`, §8). `T2 #n` refers to the trial 2 report and `T1 #n` to the trial 1 report.

**Progress (9 Oct code):** Commit `304910f` fixed several P1/P2 UI/copy items. Follow-up work (migration `20261009000019` + UI) closed all P0s and most P1/P2. Items still open are noted below.

---

## 1. Status at a glance

### Fixed across trials
- [x] **Challenge shows on the team phone** (T1 #1). It was still fixed in T3 ("Tantangan di Pandai Besi" card).
- [x] **Gold Rush +5 pays out** (T1 #2). +17 at 12-gold posts and +15 at Pandai Besi (10+5). The +15 is correct and not a bug.
- [x] **Selesai (Done) releases the team** in about 1–3 s without a refresh (T1 #3). Confirmed on every post in T2 and T3, except the off Trivia post, which had no Selesai (see P0-3).
- [x] **The shop line no longer reads like a second wallet.** "Kurang N" (Short by N) replaces "Needs 55 gold" (T1 #4).
- [x] **Event banners with a countdown show on team phones** (T2).
- [x] **Team phone gold updates live.** In T2, Team 2's gold froze at 30 until a reload. In T3 the Magpies' and Bears' gold was live all game.
- [x] **End game updates the MC panel without a reload** (T2 #2). In T3, "PERMAINAN SELESAI" showed after one press, the clock froze, and the TV, Trivia and Kartografer switched over by themselves.
- [x] **The end screen hides the ranking until the reveal** (T2 #2b). Unused teams are hidden too.
- [x] **Team/post count is configurable** (T2 #4, partly fixed). There are now Main/Tidak main (Playing/Not playing) switches. Post team pickers and the raid picker list only active teams. Off teams aren't ranked or given points. The phone's next step no longer points to Posts 4/5, which didn't exist.
- [x] **A team with 6/6 jobs at a post can still buy there** (T2, confirmed working).

### Regressions in trial 3 (worked in trial 2)
1. ~~**Kartografer's JUAL (Sell) list disappears after a purchase.**~~ Fixed in `304910f` (P1-1).
2. ~~**Toasts are unreliable on every post.**~~ Mitigated: local response toasts + busy feedback (P1-2). Re-check in next trial.
3. ~~**Tukang Kapal's job controls vanished once.**~~ Fixed by driving controls from server `serving_team_id` (P0-4).

### Still open from earlier trials (repeats)
- ~~Fired events have no line in the MC activity feed or the team travel log~~ → fixed (P1-7).
- ~~"Kamu tidak bisa melakukan itu sekarang" never says why~~ → specific codes `TEAM_BUSY` / `POST_OFF` / `NOT_SERVING` (P1-3).
- ~~Off teams/roles still appear in the lobby, QR page~~ → filtered; join rejects inactive (P0-2 / P2-6).
- ~~The Rehearsal switch caption is wrong after the start~~ → fixed (P2-7).
- ~~Deferred P2 leftovers~~ → P2-2 / P2-3 / P2-8 / P2-15 addressed in follow-up (OTP, faster event poll, MC bootstrap, light post refresh).

---

## 2. Prioritised fix list

Tags: `Regression` = worked in T2 and broke in T3. `Repeat since Tn` = first seen in trial n. `Intermittent`. `Unconfirmed` = seen once and not reproduced.

### P0: blocks play, silently changes state, or data is wrong

- [x] **P0-1. Kapal Pasokan (Supply Ship) fires silently and pushes stock above the start value** (B1)
  - **Fix shipped:** `_log` event lines for feed/travel; banner path unchanged; stock capped at `stock_start` (D6 = refill toward max). Migration `20261009000019`.

- [x] **P0-2. Switching a post "off" doesn't switch it off, and setup hides which post sells which part** (B2)
  - **Fix shipped:** setup shows "Menjual: …"; Start/Continue block inactive sellers; `lookup_game` / `join_with_pin` reject inactive roles; `record_job` / `buy_item` refuse inactive posts.

- [x] **P0-3. Claiming a team to serve fails, but jobs and sales still go through, which bypasses the queue lock** (B3)
  - **Fix shipped:** server requires `serving_team_id`; UI only shows controls when server is serving; `TEAM_BUSY` when another post has them.

- [x] **P0-4. Tukang Kapal's job controls vanish after a Pass** (B4)
  - **Fix shipped:** controls bound to server `serving_team_id`, not a local selection that can desync.

- [x] **P0-5. Scheduled events don't fire reliably: auto-fire starts off, and Obralan Pasar was skipped** (B5, B6)
  - **Fix shipped:** `auto_fire` default **on**; lobby warns if off; scheduled `market_sale` with no saleable part marks schedule skipped (OK) instead of sticking on "due now"; fire toasts + skip toast.

### P1: fairness, confusing, or affects results

- [x] **P1-1. The JUAL (Sell) section disappears after a purchase** (B20) — owned rows stay as "Sudah punya".
- [x] **P1-2. Toasts are missing on about a third of actions** (B19) — local `onOk` toasts; busy feedback toast. Re-verify in trial.
- [x] **P1-3. "Kamu tidak bisa…" never says why** (B17) — `TEAM_BUSY`, `POST_OFF`, `TEAM_OFF`, `NOT_SERVING`.
- [x] **P1-4. The raid tie rule isn't explained** (B8) — "Seri = bertahan menang" on dice screen (D1 = defender wins).
- [x] **P1-5. The raid victim gets no warning, and the raid code is always visible** (B7) — code behind "Tampilkan kode"; result dialog on victim (D5).
- [x] **P1-6. The MC raid counters are misleading** (B9) — columns: Menang serang / Menang bertahan / Raid dicoba / Emas dicuri (D4).
- [x] **P1-7. Events don't appear in the activity feed or the travel logs** (B15) — `_log` kind `event` per team; feed dedupes to one line.
- [x] **P1-8. Finished teams can keep working at some posts but not others** (B16) — **Decision D9:** jobs stay allowed after boat finish at all posts (no boat_done gate). Same rule everywhere.
- [x] **P1-9. The Sail card points to a post missing from the phone's post list** — "(pos tidak aktif)" + P0-2.
- [x] **P1-10. Battle items on the phone show no price or where to buy them** — same card format as parts.
- [x] **P1-11. The Sword's lifespan is unknown** (B10) — copy says permanent (D2).
- [x] **P1-12. Raid protection length not shown** (B11) — `safeAfter(N menit)` on results; config remains 3 min (D3).
- [x] **P1-13. "KAPAL SELESAI +15" — gold or points?** — "poin (bukan emas)" (D10 partial: phones still no running score).
- [x] **P1-14. The job timer is advisory only** (B21) — **Decision D12:** advisory (unlock on start). Keep global `job_timer_seconds`.
- [x] **P1-15. Bantuan Mercusuar doesn't say who gets it or why** — poorest-team reason in banner (D7).
- [x] **P1-16. Raid result dialogs stack on other overlays** (B12) — raid queued + auto-dismiss 8s; event banner z-40 under dialogs.
- [x] **P1-17. The MC tempo check ignores the number of teams** (B18) — scales by active teams; hides when all ships done.

### P2: polish and copy

- [x] **P2-1. Mixed languages and unclear labels** (B22) — emas / Indonesian tags / Gold Rush "bonus".
- [x] **P2-2. The raid code boxes look empty for a moment after typing** (B13) — pause `useNow` on OTP step; digit filter without `pattern`; narrower slot transition.
- [x] **P2-3. The KAPAL SELESAI banner reaches other phones about 13 s late** (B28) — heartbeat 5s, dedicated `world_events` poll 2.5s, refresh events on team changes, banner max age 20s.
- [x] **P2-4. The join page shows stale saved logins** (B26) — home prunes dead tokens on load.
- [x] **P2-5. "Langkah N dari 4"** (B27) — now "dari 3".
- [x] **P2-6. Off roles are still listed, and the lobby count is wrong** (B23) — active filter + MC in count.
- [x] **P2-7. The Rehearsal caption is wrong after the start** (B24).
- [x] **P2-8. MC navigation hang on direct /mc/setup|/lobby|/qr** (B25) — parallel whoami+pass; QR/lobby card overlay replaces Dialog; pins persist in sessionStorage.
- [x] **P2-9. Undo bar stays up after Done** (T2 #7) — undo only while serving.
- [x] **P2-10. Jobs used up** (T2 #8) — "Pekerjaan habis" message.
- [x] **P2-11. Schedule clarity** (T2 #5) — mm:ss schedule clocks; fire/skip toasts.
- [x] **P2-12. MC Parts column** (T2 #8) — owned vs missing styling (already present; titles added).
- [x] **P2-13. Sell vs bought wording** (T2 #8) — post toast: "Dijual: … ke …".
- [x] **P2-14. "Snow rejoin code" typo** (T1) — Indonesian copy is "Tampilkan kode masuk kembali" (English typo gone).
- [x] **P2-15. Occasional slow result** (T2/T3) — post actions use targeted `refreshTables` instead of full `loadAll`.
- [x] **P2-16. Selected team stays highlighted while not serving** — highlight = serving only.

---

## 3. Design questions / decisions needed

| # | Question | Decision (9 Oct) |
| --- | --- | --- |
| D1 | **Raid ties:** defender wins? | **Yes** — stated on dice screen. |
| D2 | **Sword lifespan** | **Permanent** — copy updated. |
| D3 | **Failed raids / protection** | Keep: failed/blocked raids still spend a raid attempt; victim gets protection; length = `immune_minutes` (3). Shown on result. |
| D4 | **Defending counters** | Split columns: attack wins / defence wins / attempts / gold stolen. |
| D5 | **Raid code secrecy** | Hide behind tap (already). Victim gets result dialog. |
| D6 | **Kapal Pasokan** | **Cap at `stock_start`** (no stock above start). |
| D7 | **Bantuan Mercusuar** | Trailing = poorest gold; banner explains. |
| D8 | **Events after all ships done** | Auto-fire **on** by default; market_sale with nothing to sell is **skipped** (schedule clears). Other events still fire. |
| D9 | **Finished teams** | **May keep doing jobs** at every post (same rule). |
| D10 | **Scoring visibility** | Finish bonus labeled as points; full running score on phone still optional later. |
| D11 | **Off posts** | Reject join; show Menjual; block Start if a part has no seller. |
| D12 | **Job timer** | **Advisory** (unlock on tap); global seconds. |
| D13 | **Phone buy button** | Unchanged — posts make purchases. |
| D14 | **Untung Ganda** | Unchanged — not investigated this pass. |
| D15 | **Tempo check** | Scale with active teams; hide when all finished. |
| D16 | **Events in travel logs** | Yes — per-team `event` action lines. |

---

## 4. Feature suggestions and improvements

- **Setup validation:** show "Menjual: …" (Sells: …) per post. Warn or block if any part has no seller. Show a summary before Start (teams, posts, part→post, auto-fire state). ✅ done
- **Auto-fire visibility:** default it to on. On the MC panel, show the next event with a countdown and the reason any event was skipped. ✅ mostly (skip toast)
- **One event pipeline:** every event → banner + MC feed + travel-log. ✅ done
- **Raid UX:** Rules/tie text, victim dialog, code on tap, protection length, queue/auto-dismiss. ✅ done
- **Battle items on the phone:** ✅ done
- **Points on the phone:** finish bonus clarified; full scoreboard still optional.
- **Post toasts:** ✅ improved
- **Sell list:** ✅ Sudah punya rows
- **MC raid columns:** ✅ split
- **Tempo check:** ✅ done
- **Lobby/QR:** ✅ active only + MC counted
- **Language pass:** ✅ largely done

---

## 5. Suggested next test plan

Goal: cover what trial 3 couldn't reach and confirm the fixes above. Keep the bot setup, but play the game long enough to reach minute 40.

1. **Setup**
   - 3 or more teams on (to test Mercusuar targeting, tie-breaks and raid pickers with several choices).
   - **All 5 posts on, including Pondok Pelabuhan and Trivia.** Pondok Pelabuhan has never been tested.
   - Separately, try switching off a post that sells a part, and check that setup warns or blocks (P0-2). Try joining an off post with its code. It should be rejected.
   - Leave auto-fire at its default and record whether it's on (P0-5) — expect **on**.
2. **Pace the game to reach minute 40.** Raise prices or delay purchases so no ship finishes before about minute 35. Then the events at 29–40 fire with teams still playing: **Jam Bajak Laut (29), Hadiah Buronan (34), Gold Rush 2 (35), Last Call (40)**. For each, record banner, feed line and log line on every screen.
3. **Events 23–27 again:** confirm Kapal Pasokan shows a banner and a feed line, and stock does **not** exceed `stock_start`. Confirm Obralan Pasar fires while teams are still building (or shows skip toast if nothing to sell). Note who gets Bantuan Mercusuar with 3 teams.
4. **Raids**
   - A **successful raid with gold stolen**: check the gold moved, the MC counters, both screens and both logs.
   - **Shield vs Sword:** a Sword raid on a shielded team.
   - A deliberate tie, to confirm the rule text after the fix.
   - Check whether the Sword persists after one raid (P1-11). Time the protection with a stopwatch (P1-12).
   - Raid during Jam Bajak Laut, if it changes raid rules.
5. **Post serving**
   - Repeat Pass → buy → Pass on Tukang Kapal on the first visit (P0-4 repro).
   - With Trivia **on**, check whether the P0-3 serve-claim bug still happens.
   - Tap a team that's busy elsewhere, and check the refusal says why (`… sedang dilayani di …`).
   - Count toasts per action on every post (P1-2).
   - Buy the last item at single-item posts (Kartografer, Trivia) and check that the sell list stays (P1-1).
6. **Finished teams:** after a team finishes, try jobs at every post — all should allow jobs (D9).
7. **Timer:** advisory unlock on start still expected (D12).
8. **Rehearsal mode (Latihan) on:** confirm the clock runs 4× and the events scale. This has never been tested.
9. **End and reveal:** end mid-game. Run the full "Mulai pengumuman" (Start the reveal), which has never been started in any trial. Check every screen reaches the reveal without a reload, including a post page that's been left open for a long time (T2 Post 1 case).
10. **Re-check leftovers:** P2-2 OTP flash, P2-8 MC deep-link hang, P2-15 lag.

---

## 6. Ship checklist (this pass)

1. Apply migration: `npx supabase db push` (or your usual migrate) for `20261009000019_trial3_p0_fixes.sql`.
2. Deploy app with the UI/copy changes.
3. Smoke: new game has auto_fire on; turn off Trivia → Continue blocked; claim team → Pass works; buy without claim → refused; fire Kapal Pasokan → banner + feed + stock ≤ start.
