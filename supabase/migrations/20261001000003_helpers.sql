-- Shared helpers. None of these are callable by anon.

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
  "jobs_per_post": 4,
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
    "15": { "normal": 9,  "slow_at_or_below": 7,  "fast_at_or_above": 12 },
    "25": { "normal": 16, "slow_at_or_below": 14, "fast_at_or_above": 19 }
  },
  "post_rules": {
    "shipwright":   "Job: build the tower. Pass if it stands for 3 seconds.",
    "sailmaker":    "Job: tie the knots. Pass if all knots hold.",
    "cartographer": "Job: solve the map puzzle. Pass if it is right in 60 seconds.",
    "inn":          "Job: the tasting game. Pass if the team gets 3 of 5 right.",
    "blacksmith":   "Job: ring toss. Pass if 3 rings land."
  }
}'::jsonb
$$;

create or replace function _now_ms() returns bigint
language sql volatile as $$ select (extract(epoch from clock_timestamp()) * 1000)::bigint $$;

create or replace function _ok(p_state jsonb default '{}'::jsonb) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', true, 'state', p_state) $$;

create or replace function _err(p_code text, p_args jsonb default '{}'::jsonb) returns jsonb
language sql immutable as $$ select jsonb_build_object('ok', false, 'error_code', p_code, 'args', p_args) $$;

-- Idempotency. Returns the stored result if this action_id was seen before, else null.
-- A second identical request blocks on the unique key until the first one commits.
create or replace function _begin_request(p_action_id uuid, p_game_id uuid, p_type text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  insert into requests (action_id, game_id, type) values (p_action_id, p_game_id, p_type)
  on conflict (action_id) do nothing;
  if found then return null; end if;
  select result into r from requests where action_id = p_action_id;
  return coalesce(r, _err('IN_PROGRESS'));
end $$;

create or replace function _finish(p_action_id uuid, p_result jsonb) returns jsonb
language plpgsql as $$
begin
  update requests set result = p_result where action_id = p_action_id;
  return p_result;
end $$;

create or replace function _new_token() returns text
language sql volatile as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_')
$$;

create or replace function _new_game_code() returns text
language plpgsql volatile as $$
declare c text;
begin
  loop
    select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ', 1 + floor(random() * 24)::int, 1), '')
      into c from generate_series(1, 6);
    exit when not exists (select 1 from games where code = c);
  end loop;
  return c;
end $$;

-- A new 4-digit raid code, different from every other code in this game.
create or replace function _new_raid_code(p_game_id uuid) returns text
language plpgsql volatile as $$
declare c text;
begin
  loop
    c := lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from team_secrets where game_id = p_game_id and raid_code = c);
  end loop;
  return c;
end $$;

-- Put teams, stock, job counts and posts back to the start of play.
create or replace function _init_play_state(p_game_id uuid) returns void
language plpgsql as $$
declare
  cfg jsonb;
  t record;
begin
  select config into cfg from games where id = p_game_id;

  update teams set
    gold = (cfg->>'start_gold')::int,
    has_hull = false, has_mast = false, has_sail = false, has_map = false,
    has_flag = false, raids_left = 0, has_sword = false, shield_count = 0,
    double_armed = false, double_used = false, raid_wins = 0, times_raided = 0,
    immune_until = null, boat_done_at = null, boat_rank = null
  where game_id = p_game_id;

  delete from stock where game_id = p_game_id;
  insert into stock (game_id, part, qty)
    select p_game_id, p, (cfg->>'stock_start')::int from unnest(array['hull','mast','sail','map']) p;

  delete from job_counts where game_id = p_game_id;
  insert into job_counts (game_id, team_id, post_id, count)
    select p_game_id, t2.id, p.id, 0
    from teams t2 cross join posts p
    where t2.game_id = p_game_id and p.game_id = p_game_id;

  update posts set serving_team_id = null, waiting_count = 0, updated_at = now()
  where game_id = p_game_id;

  delete from team_secrets where game_id = p_game_id;
  for t in select id from teams where game_id = p_game_id order by slot loop
    insert into team_secrets (team_id, game_id, raid_code)
    values (t.id, p_game_id, _new_raid_code(p_game_id));
  end loop;
end $$;
