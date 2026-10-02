-- Review fixes: real post job texts, no raid on a team with 0 gold,
-- and Bounty targets frozen when the MC fires the event.

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
    "shipwright":   "Human Boat: all players make a boat shape in 20 seconds and row together. Pass if everyone is in the boat and rowing. Twist: row to a \"1, 2, 3\" count in Mandarin.",
    "sailmaker":    "Sailor''s Chant: all players do a 10-second chant with a move. Pass if everyone is in time. Twist: end with \"加油!\".",
    "cartographer": "Map Memory: show the Taiwan map card for 10 seconds, then hide it. Pass if the team names 4 of the 6 cities.",
    "inn":          "Silent Pirate: one player acts out a word with no sound. Pass if the team guesses it in 45 seconds. Words: bubble tea, beef noodles, scooter, night market.",
    "blacksmith":   "Battle Cry: all players make a pirate cry with an action. Pass if everyone joins and it lasts at least 5 seconds."
  }
}'::jsonb
$$;

-- Unstarted games, including the demo, pick up the new job texts.
update games
set config = jsonb_set(config, '{post_rules}', default_config()->'post_rules')
where status = 'setup';

------------------------------------------------------------------------------
-- start_raid: the attacker picked a team and typed that team's code.
-- Check order: own team, can act, Flag, blocked, code, defender safe,
-- defender raided too often, defender has gold.
------------------------------------------------------------------------------
create or replace function start_raid(
  p_action_id uuid, p_game_id uuid, p_attacker_id uuid, p_defender_id uuid, p_code text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  att teams;
  def teams;
  att_secret team_secrets;
  def_secret team_secrets;
  max_tries constant int := 3;
  v_result text;
  att_die int;
  def_die int;
  att_bonus int := 0;
  def_bonus int := 0;
  v_amount int := 0;
  doubled boolean := false;
  pirate_hour boolean := false;
  bounty boolean := false;
  bounty_ev world_events;
  raid_id uuid;
begin
  r := _begin_request(p_action_id, p_game_id, 'start_raid');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;

  if p_attacker_id = p_defender_id then
    return _with_now(_finish(p_action_id, _err('OWN_TEAM')));
  end if;

  -- Lock both teams in id order so two raids at once cannot deadlock.
  perform 1 from teams where id in (p_attacker_id, p_defender_id) and game_id = g.id order by id for update;
  select * into att from teams where id = p_attacker_id and game_id = g.id;
  select * into def from teams where id = p_defender_id and game_id = g.id;
  if att.id is null or def.id is null then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  r := _check_can_act(g, 'raid');
  if r is not null then return _with_now(_finish(p_action_id, r)); end if;

  if not att.has_flag or att.raids_left <= 0 then
    return _with_now(_finish(p_action_id, _err('NO_RAIDS')));
  end if;

  select * into att_secret from team_secrets where team_id = att.id for update;
  select * into def_secret from team_secrets where team_id = def.id for update;

  if att_secret.raid_blocked_until > now() then
    return _with_now(_finish(p_action_id, _err('RAID_BLOCKED',
      jsonb_build_object('seconds_left', ceil(extract(epoch from att_secret.raid_blocked_until - now()))))));
  end if;

  -- Wrong code: count it. The 3rd wrong code blocks raids for 30 real seconds.
  if p_code is distinct from def_secret.raid_code then
    if att_secret.wrong_codes + 1 >= max_tries then
      update team_secrets set wrong_codes = 0, raid_blocked_until = now() + interval '30 seconds'
        where team_id = att.id;
      return _with_now(_finish(p_action_id, _err('RAID_BLOCKED', jsonb_build_object('seconds_left', 30))));
    end if;
    update team_secrets set wrong_codes = wrong_codes + 1 where team_id = att.id;
    return _with_now(_finish(p_action_id, _err('WRONG_CODE',
      jsonb_build_object('tries_left', max_tries - att_secret.wrong_codes - 1))));
  end if;
  update team_secrets set wrong_codes = 0 where team_id = att.id;

  if def.immune_until > now() then
    return _with_now(_finish(p_action_id, _err('DEFENDER_SAFE', jsonb_build_object(
      'team', def.name, 'seconds_left', ceil(extract(epoch from def.immune_until - now()))))));
  end if;
  if def.times_raided >= (g.config->'raid'->>'max_times_raided')::int then
    return _with_now(_finish(p_action_id, _err('MAX_RAIDED', jsonb_build_object('team', def.name))));
  end if;
  if def.gold <= 0 then
    return _with_now(_finish(p_action_id, _err('NOTHING_TO_STEAL', jsonb_build_object('team', def.name))));
  end if;

  -- The code is right and the raid is allowed: it uses 1 raid from here on.
  if def.shield_count > 0 then
    v_result := 'blocked';
    update teams set shield_count = 0 where id = def.id;
  else
    att_die := _roll(g, 'attacker');
    def_die := _roll(g, 'defender');
    if att.has_sword then att_bonus := (g.config->'items'->'sword'->>'bonus')::int; end if;
    if def.has_sword then def_bonus := (g.config->'items'->'sword'->>'bonus')::int; end if;
    -- A tie goes to the defender.
    v_result := case when att_die + att_bonus > def_die + def_bonus then 'win' else 'loss' end;
  end if;

  if v_result = 'win' then
    v_amount := (g.config->'raid'->>'steal')::int;
    if (_active_event(g.id, 'pirate_hour')).id is not null then
      pirate_hour := true;
      v_amount := v_amount * (g.config->'events'->>'pirate_hour_multiplier')::int;
    end if;
    bounty_ev := _active_event(g.id, 'bounty');
    if bounty_ev.id is not null and (bounty_ev.payload->'team_ids') ? def.id::text then
      bounty := true;
      v_amount := v_amount + (g.config->'events'->>'bounty_bonus')::int;
    end if;
    if att.double_armed then
      doubled := true;
      v_amount := v_amount * 2;
    end if;
    v_amount := least(v_amount, def.gold);

    update teams set
      gold = gold + v_amount,
      raid_wins = raid_wins + 1,
      double_armed = case when doubled then false else double_armed end,
      double_used  = case when doubled then true  else double_used  end
    where id = att.id;
    update teams set gold = gold - v_amount where id = def.id;
  end if;

  update teams set raids_left = raids_left - 1 where id = att.id;
  update teams set
    times_raided = times_raided + 1,
    immune_until = now() + _real_interval(g, (g.config->'raid'->>'immune_minutes')::numeric)
  where id = def.id;
  update team_secrets set raid_code = _new_raid_code(g.id) where team_id = def.id;

  insert into raids (game_id, request_id, attacker_id, defender_id,
                     attacker_die, attacker_bonus, defender_die, defender_bonus, result, amount)
  values (g.id, p_action_id, att.id, def.id, att_die, att_bonus, def_die, def_bonus, v_result, v_amount)
  returning id into raid_id;

  perform _log(g, p_action_id, 'team', null, att.id, att.id, 'raid', v_amount, null,
               jsonb_build_object('raid_id', raid_id, 'result', v_result, 'other', def.name,
                                  'doubled', doubled, 'pirate_hour', pirate_hour, 'bounty', bounty));
  perform _log(g, p_action_id, 'team', null, att.id, def.id, 'raided', -v_amount, null,
               jsonb_build_object('raid_id', raid_id, 'result', v_result, 'other', att.name));

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object(
    'raid_id', raid_id, 'result', v_result, 'defender', def.name, 'amount', v_amount,
    'attacker_die', att_die, 'attacker_bonus', att_bonus,
    'defender_die', def_die, 'defender_bonus', def_bonus,
    'doubled', doubled, 'pirate_hour', pirate_hour, 'bounty', bounty,
    'raids_left', att.raids_left - 1))));
end $$;

------------------------------------------------------------------------------
-- fire_event: every event in the MC panel. p_schedule_index is set when the
-- event comes from the schedule, so it can only fire once.
------------------------------------------------------------------------------
create or replace function fire_event(
  p_action_id uuid, p_game_id uuid, p_kind text, p_payload jsonb, p_schedule_index int
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  ev jsonb;
  minutes numeric;
  v_payload jsonb := '{}'::jsonb;
  v_part text;
  v_min int;
  v_max int;
  names jsonb;
  ids jsonb;
  t record;
  aid int;
begin
  r := _begin_request(p_action_id, p_game_id, 'fire_event');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  ev := g.config->'events';

  if g.status not in ('running', 'last_call') then
    return _with_now(_finish(p_action_id, _err('NOT_STARTED')));
  end if;
  if g.paused_at is not null then
    return _with_now(_finish(p_action_id, _err('PAUSED')));
  end if;
  if p_schedule_index is not null and exists (
    select 1 from world_events where game_id = g.id and schedule_index = p_schedule_index and cancelled_at is null
  ) then
    return _with_now(_finish(p_action_id, _err('ALREADY_FIRED')));
  end if;

  minutes := case p_kind
    when 'gold_rush'   then (ev->>'gold_rush_minutes')::numeric
    when 'storm'       then (ev->>'storm_minutes')::numeric
    when 'market_sale' then (ev->>'market_sale_minutes')::numeric
    when 'pirate_hour' then (ev->>'pirate_hour_minutes')::numeric
    when 'bounty'      then (ev->>'bounty_minutes')::numeric
  end;

  if p_kind = 'gold_rush' then
    v_payload := jsonb_build_object('bonus', (ev->>'gold_rush_bonus')::int);

  elsif p_kind = 'storm' then
    v_payload := '{}'::jsonb;

  elsif p_kind = 'pirate_hour' then
    v_payload := jsonb_build_object('multiplier', (ev->>'pirate_hour_multiplier')::int);

  elsif p_kind = 'supply_ship' then
    update stock set qty = qty + (g.config->>'supply_ship_add')::int where game_id = g.id;
    v_payload := jsonb_build_object('add', (g.config->>'supply_ship_add')::int);

  elsif p_kind = 'lighthouse_aid' then
    aid := (ev->>'lighthouse_aid')::int;
    perform 1 from teams where game_id = g.id order by id for update;
    select min(gold) into v_min from teams where game_id = g.id;
    select jsonb_agg(name order by slot) into names from teams where game_id = g.id and gold = v_min;
    for t in select id from teams where game_id = g.id and gold = v_min loop
      update teams set gold = gold + aid where id = t.id;
      perform _log(g, p_action_id, 'mc', null, null, t.id, 'lighthouse', aid, null, '{}'::jsonb);
    end loop;
    v_payload := jsonb_build_object('teams', names, 'amount', aid);

  elsif p_kind = 'market_sale' then
    -- A part that is in stock and still missing from at least one team.
    select s.part into v_part from stock s
    where s.game_id = g.id and s.qty > 0
      and exists (select 1 from teams x where x.game_id = g.id and not case s.part
                    when 'hull' then x.has_hull when 'mast' then x.has_mast
                    when 'sail' then x.has_sail else x.has_map end)
    order by random() limit 1;
    if v_part is null then
      return _with_now(_finish(p_action_id, _err('NO_SALE_PART')));
    end if;
    v_payload := jsonb_build_object('part', v_part, 'discount', (ev->>'market_sale_discount')::int);

  elsif p_kind = 'bounty' then
    select max(gold) into v_max from teams where game_id = g.id;
    select jsonb_agg(name order by slot), jsonb_agg(id order by slot)
      into names, ids
      from teams where game_id = g.id and gold = v_max;
    v_payload := jsonb_build_object('teams', names, 'team_ids', ids, 'bonus', (ev->>'bounty_bonus')::int);

  elsif p_kind = 'message' then
    if coalesce(trim(p_payload->>'text'), '') = '' then
      return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
    end if;
    v_payload := jsonb_build_object('text', left(trim(p_payload->>'text'), 200));

  elsif p_kind = 'last_call' then
    if g.status <> 'running' then
      return _with_now(_finish(p_action_id, _err('BAD_STATE', jsonb_build_object('status', g.status))));
    end if;
    update games set status = 'last_call' where id = g.id;

  else
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  -- Firing a kind that is already running restarts its timer.
  if minutes is not null then
    update world_events set ends_at = now()
      where game_id = g.id and kind = p_kind and cancelled_at is null and ends_at > now();
  end if;

  insert into world_events (game_id, kind, payload, schedule_index, starts_at, ends_at)
  values (g.id, p_kind, v_payload, p_schedule_index, now(),
          case when minutes is not null then now() + _real_interval(g, minutes) end);

  return _with_now(_finish(p_action_id, _ok(v_payload)));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function current_prices(uuid) to anon, authenticated;
grant execute on function game_scores(uuid) to anon, authenticated;
