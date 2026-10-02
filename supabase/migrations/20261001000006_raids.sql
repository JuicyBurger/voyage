-- Raids: raid codes, start_raid, Shield, Sword, immunity.

-- A d6 roll on the server. A test game can force the result with config.test_force_roll.
create or replace function _roll(g games, p_side text) returns int
language sql volatile as $$
  select coalesce((g.config->'test_force_roll'->>p_side)::int, 1 + floor(random() * 6)::int)
$$;

-- The team's own raid code. Read through the API only.
create or replace function get_my_raid_code(p_game_id uuid, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s team_secrets;
begin
  select * into s from team_secrets where team_id = p_team_id and game_id = p_game_id;
  if s.team_id is null then return _with_now(_err('BAD_INPUT')); end if;
  return _with_now(_ok(jsonb_build_object('code', s.raid_code)));
end $$;

------------------------------------------------------------------------------
-- start_raid: the attacker picked a team and typed that team's code.
-- Check order: own team, flag, blocked, wrong code, defender safe, defender raided too often.
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
  richest int;
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
    select max(gold) into richest from teams where game_id = g.id;
    if (_active_event(g.id, 'bounty')).id is not null and def.gold = richest then
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

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function current_prices(uuid) to anon, authenticated;
