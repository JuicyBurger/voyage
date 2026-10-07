-- Pace check minutes corrected (measured at event minutes 20 and 25),
-- jobs per post 4 -> 6, and the real post job texts.

create or replace function default_config() returns jsonb
language sql immutable as $$
select '{
  "start_gold": 30,
  "parts": {
    "hull": { "price": 55, "post": "shipwright" },
    "mast": { "price": 35, "post": "shipwright" },
    "sail": { "price": 45, "post": "sailmaker" },
    "map":  { "price": 35, "post": "cartographer" }
  },
  "stock_start": 3,
  "supply_ship_add": 2,
  "job_pay": { "shipwright": 12, "sailmaker": 12, "cartographer": 12, "inn": 10, "blacksmith": 10 },
  "fail_pay": 4,
  "jobs_per_post": 6,
  "items": {
    "flag":   { "price": 15, "raids": 3 },
    "sword":  { "price": 15, "bonus": 1 },
    "shield": { "price": 15 }
  },
  "raid": { "steal": 15, "immune_minutes": 3, "max_times_raided": 3 },
  "events": {
    "gold_rush_bonus": 5, "gold_rush_minutes": 2,
    "storm_minutes": 1,
    "market_sale_discount": 10, "market_sale_minutes": 2,
    "pirate_hour_multiplier": 2, "pirate_hour_minutes": 3,
    "bounty_bonus": 10, "bounty_minutes": 3,
    "lighthouse_aid": 15,
    "price_dial_percent": 20
  },
  "scoring": {
    "per_part": 15, "boat_bonus": 40, "finish_order": [15, 10, 5],
    "gold_per_point": 5, "per_raid_win": 5,
    "most_raids_bonus": 10, "most_raids_min": 2
  },
  "clock": { "play_start_minute": 5, "last_call_minute": 40, "end_minute": 45 },
  "schedule": [
    { "minute": 13, "kind": "gold_rush" },
    { "minute": 19, "kind": "storm" },
    { "minute": 23, "kind": "supply_ship" },
    { "minute": 25, "kind": "lighthouse_aid" },
    { "minute": 27, "kind": "market_sale" },
    { "minute": 29, "kind": "pirate_hour" },
    { "minute": 34, "kind": "bounty" },
    { "minute": 35, "kind": "gold_rush" },
    { "minute": 40, "kind": "last_call" }
  ],
  "pace_check": {
    "20": { "normal": 9,  "slow_at_or_below": 7,  "fast_at_or_above": 12 },
    "25": { "normal": 11, "slow_at_or_below": 10, "fast_at_or_above": 14 }
  },
  "post_rules": {
    "shipwright":   "Human Boat (20 s): the team stands in one line and rows together. Pass if everyone stays in line and rows until time is up. Twist by Jobs here: silent, count 1-2-3 in Mandarin, follow your claps, sing, eyes closed, squat.",
    "sailmaker":    "Team Yel-yel (10-15 s): the team performs its own chant with a move. Pass if everyone joins, in sync, for at least 10 seconds. Optional twist: whisper, super fast, dramatic, slow motion, loudest.",
    "cartographer": "Landmark Cards: show 1 random Taiwan landmark card. The team has 3 tries to name it. Give small hints. Pass if right within 3 tries. Always say the answer at the end, then shuffle the card back in.",
    "inn":          "Silent Pirate (45 s): one player acts out a secret word with no sound, no mouthing and no pointing. Use a different player each round. Pass if the team guesses it in 45 seconds. Word lists are on the post sheet.",
    "blacksmith":   "Count Together (45 s): circle, eyes closed. Count the round''s numbers, one voice per number, any order. Nobody says 2 in a row, everyone speaks at least once. Two voices at once: start again. Pass if they reach the end in time."
  }
}'::jsonb
$$;

-- Unstarted games, including the demo, pick up the new pace, job limit, and texts.
update games
set config = config
  || jsonb_build_object(
       'jobs_per_post', default_config()->'jobs_per_post',
       'pace_check',    default_config()->'pace_check',
       'post_rules',    default_config()->'post_rules')
where status = 'setup';

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function _pass_game_id() to authenticated;
grant execute on function current_prices(uuid) to authenticated;
grant execute on function game_scores(uuid) to authenticated;
