# Phase 3: raids

A raid starts on the attacker's team phone. The attacker walks over, picks the other crew, and types that crew's 4-digit code. The code is the proof they are face to face.

## What was built

`20261001000006_raids.sql`:

- `get_my_raid_code`. A team can read only its own code, and only through the API.
- `start_raid`. Dice are rolled in Postgres. A test game can force them with `config.test_force_roll`. The API rejects that field unless `ALLOW_TEST_HOOKS=1`.
- Check order, and anything that fails does **not** use a raid:
  1. Not your own crew.
  2. The game is running, not paused, not in Storm, and not in Last Call.
  3. The attacker has a Flag with raids left.
  4. The attacker is not in the 30-second wrong-code block.
  5. The code is right. The third wrong code blocks that team's raids for 30 real seconds. The counter resets on a right code.
  6. The defender is not still safe (`immune_until`).
  7. The defender has not been raided `max_times_raided` times (default 3).
  8. The defender has gold. A team with 0 gold returns `NOTHING_TO_STEAL`. No Shield is used, no dice are rolled, and `times_raided`, `immune_until`, and the raid code stay as they are.
- After those checks, one raid is used.
- If the defender holds a Shield, the Shield is used up, the result is `blocked`, and no dice are rolled.
- Otherwise each side rolls a d6. A Sword adds its bonus on attack and on defence. The higher total wins. A tie goes to the defender.
- A win steals `steal` gold (default 15), times the Pirate Hour multiplier when that event is on, plus the Bounty bonus when the defender is one of the teams named when Bounty was fired. Double Profit doubles the amount and is then used. The amount is capped at the defender's gold. A loss changes nothing else. Double Profit stays armed on a loss.
- Win, loss, or blocked: `times_raided` goes up, the defender is safe for `immune_minutes` (shorter in rehearsal), and the defender gets a new 4-digit code, unique in that game.

The schema stores `attacker_die`, `defender_die`, and the sword bonuses separately, so the animation can show the face and the bonus.

Screens, all on the team phone:

- A **Raid!** button once the team has a Flag with raids left. The sheet asks which crew, then shows a 4-digit input. Crews that are safe show a countdown. Crews raided too often are greyed out.
- About 2 seconds of tumbling dice (`components/team/raid-dice.tsx`), then the result, a tune, and vibration.
- The defender's phone pops the same dice (`incoming-raid.tsx`), for example "Magpies raided you and took 15 gold!" A raid older than 15 seconds is not replayed, so a waking phone does not show an old fight.
- **My raid code** stays behind **Show code**. Opening it again after a raid fetches the new code.
- A "safe from raids" strip counts down. The journey log and the public feed each get a raid line. The feed never includes the code.

## How it was tested

The scenario script grew a raid section and passed every case: no Flag, own team, three wrong codes and the block, a forced win, the second raid while safe (no raid used), a Shield, Double Profit on a win capped at the defender's gold, a tie going to the defender, the fourth raid on one team, and Last Call.

In the browser, the Magpies typed a wrong code (the message said 2 tries left), then the real Macaques code. The server rolled 2 against 3, so the Magpies lost. The Bears' phone later showed a "RAID!" pop-up with the same dice after the Magpies won a second fight (4 against 3, 15 gold). The new code and the safe countdown both updated.

## Notes

Pirate Hour and Bounty already changed the steal amount inside `start_raid`. The MC could not fire those events until Phase 4. Their scenario checks were added with that phase.
