# Phase 5: scoring and the TV

Scores are computed, never typed in. The MC table, the TV, and the final reveal all call one function.

## The formula

`game_scores` in `20261001000008_scoring.sql`:

```
points = parts owned × per_part
       + boat bonus, if the boat is finished
       + finish_order[boat_rank - 1], if the rank is in that list
       + floor(gold / gold_per_point)
       + raid wins × per_raid_win
       + most-raids bonus, if this team has the most wins and at least most_raids_min wins
         (a tie: every tied team gets it)
```

Defaults make the worked example true: 4 parts, first boat, 42 gold, 0 raid wins.

`60 + 40 + 15 + floor(42 / 5) = 123`

Place order is more points, then more gold, then the earlier boat. Anon can call `game_scores` because it only reads public team columns. Team phones still do not show other teams' gold or points. Only the MC and the TV do.

## The reveal

`reveal` has three steps.

- **start**. Only after End. It copies `game_scores` into `games.final_scores` and sets `reveal_step` to 0. After that, `mc_adjust` returns `REVEAL_LOCKED`. Between End and Start the reveal, the MC can still fix numbers. The snapshot is taken when the reveal starts, not when the game ends.
- **next** and **back**. Step from last place toward first, one place at a time. Next stops at the last place.

`reset_game` clears `reveal_step`, `final_scores`, and `show_scores_on_tv`.

## Screens

- The teams table gained a Points column with the place.
- `components/mc/reveal-controls.tsx`. The TV score switch, Start, Next, and Back. After End, the card moves to the top of the MC panel. The button label says "All places are shown" once first place is up, instead of a "0th place" label.
- `components/game/reveal-view.tsx`. Places appear from last to first. At first place it shows "Bears win!", confetti, a tune, and vibration. Team and post phones cover the screen with this view. A team's own row is highlighted on that team's phone.
- `components/tv/tv-screen.tsx` replaced the placeholder at `/screen/[gameCode]`. No token. It looks up the game by the six-letter code, shows a large clock, the event strips and banners, the Storm cover, boats finished so far, and a feed. MC corrections (`adjust`) are left off the TV feed. Scores are hidden until the MC turns them on. During the reveal the whole screen becomes the ranking.

The TV has no Start tap, and browsers block sound until a gesture, so a TV should be tapped once if the banners need to be heard. Confetti still runs.

## How it was tested

The scenario script checked 123 points, no most-raids bonus at 1 win, +10 at 2 wins, reveal refused before End, adjust still allowed after End, adjust refused after the reveal starts, and the step stopping at 5.

In the browser the demo TV at `/screen/DEMOGM` showed Bears at 121 (4 parts, boat rank 1, 30 gold: `60 + 40 + 15 + 6`), Pangolins 36, Macaques 26, Magpies 11, Pheasants 10. Walking Next from the API switched the TV to "THE FINAL VOYAGE" and ended on "Bears win!".
