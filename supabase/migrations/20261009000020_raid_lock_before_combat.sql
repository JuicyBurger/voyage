-- Raid lock happens when the attack starts (valid code), not only on a win.
-- If the defender is being served at a post, defer the lock until Selesai.
-- Loss / shield-block clears the lock; win keeps it until unlock OTP.

alter table teams
  add column if not exists raid_lock_pending_by uuid references teams(id),
  add column if not exists raid_lock_pending_code text;

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
    immune_until = null, raid_locked_by = null, raid_unlock_code = null,
    raid_lock_pending_by = null, raid_lock_pending_code = null,
    boat_done_at = null, boat_rank = null
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

-- Apply active lock, or queue it if the defender is mid-serve at a post.
create or replace function _raid_seize(
  p_game_id uuid, p_defender_id uuid, p_attacker_id uuid, p_unlock_code text
) returns boolean
language plpgsql as $$
declare serving boolean;
begin
  select exists (
    select 1 from posts where game_id = p_game_id and serving_team_id = p_defender_id
  ) into serving;

  if serving then
    update teams set
      raid_lock_pending_by = p_attacker_id,
      raid_lock_pending_code = p_unlock_code,
      raid_locked_by = null,
      raid_unlock_code = null
    where id = p_defender_id;
    return true; -- deferred
  end if;

  update teams set
    raid_locked_by = p_attacker_id,
    raid_unlock_code = p_unlock_code,
    raid_lock_pending_by = null,
    raid_lock_pending_code = null
  where id = p_defender_id;
  return false;
end $$;

create or replace function _raid_release_lock(p_defender_id uuid) returns void
language plpgsql as $$
begin
  update teams set
    raid_locked_by = null,
    raid_unlock_code = null,
    raid_lock_pending_by = null,
    raid_lock_pending_code = null
  where id = p_defender_id;
end $$;

------------------------------------------------------------------------------
-- start_raid: seize (lock or pending) BEFORE combat; clear seize on loss/block
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
  unlock_code text;
  deferred boolean := false;
begin
  r := _begin_request(p_action_id, p_game_id, 'start_raid');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;

  if p_attacker_id = p_defender_id then
    return _with_now(_finish(p_action_id, _err('OWN_TEAM')));
  end if;

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
  if def.raid_locked_by is not null or def.raid_lock_pending_by is not null then
    return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', def.name))));
  end if;

  -- Seize the defender before combat so the raid cannot be ignored.
  unlock_code := _new_unlock_code(g.id);
  deferred := _raid_seize(g.id, def.id, att.id, unlock_code);

  if def.shield_count > 0 then
    v_result := 'blocked';
    update teams set shield_count = 0 where id = def.id;
  else
    att_die := _roll(g, 'attacker');
    def_die := _roll(g, 'defender');
    if att.has_sword then att_bonus := (g.config->'items'->'sword'->>'bonus')::int; end if;
    if def.has_sword then def_bonus := (g.config->'items'->'sword'->>'bonus')::int; end if;
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
    -- Keep seize (active or pending). Do not kick them off a post mid-serve.
  else
    -- Loss / shield: raid happened, but release the seize.
    perform _raid_release_lock(def.id);
    unlock_code := null;
    deferred := false;
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
                                  'doubled', doubled, 'pirate_hour', pirate_hour, 'bounty', bounty,
                                  'lock_deferred', deferred));
  perform _log(g, p_action_id, 'team', null, att.id, def.id, 'raided', -v_amount, null,
               jsonb_build_object('raid_id', raid_id, 'result', v_result, 'other', att.name,
                                  'lock_deferred', deferred));

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object(
    'raid_id', raid_id, 'result', v_result, 'defender', def.name, 'amount', v_amount,
    'attacker_die', att_die, 'attacker_bonus', att_bonus,
    'defender_die', def_die, 'defender_bonus', def_bonus,
    'doubled', doubled, 'pirate_hour', pirate_hour, 'bounty', bounty,
    'raids_left', att.raids_left - 1,
    'unlock_code', unlock_code,
    'lock_deferred', deferred))));
end $$;

------------------------------------------------------------------------------
-- set_serving: on Selesai, promote a pending raid lock to active
------------------------------------------------------------------------------
create or replace function set_serving(p_action_id uuid, p_game_id uuid, p_post_id uuid, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  t teams;
  p posts;
  other_post text;
  was_serving uuid;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_serving');
  if r is not null then return _with_now(r); end if;

  select * into p from posts where id = p_post_id and game_id = p_game_id;
  if p.id is null then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;
  if not p.active then
    return _with_now(_finish(p_action_id, _err('POST_OFF', jsonb_build_object('post', p.name))));
  end if;

  was_serving := p.serving_team_id;

  if p_team_id is not null then
    select * into t from teams where id = p_team_id and game_id = p_game_id;
    if t.id is null then
      return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
    end if;
    if not t.active then
      return _with_now(_finish(p_action_id, _err('TEAM_OFF', jsonb_build_object('team', t.name))));
    end if;
    if t.raid_locked_by is not null then
      return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', t.name))));
    end if;
    -- Pending lock means a raid already won while they were here — finish this visit first.
    if t.raid_lock_pending_by is not null and t.id is distinct from was_serving then
      return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', t.name))));
    end if;
    select name into other_post from posts
      where game_id = p_game_id and serving_team_id = p_team_id and id <> p_post_id and active;
    if other_post is not null then
      return _with_now(_finish(p_action_id, _err('TEAM_BUSY',
        jsonb_build_object('team', t.name, 'post', other_post))));
    end if;
  end if;

  update posts set serving_team_id = p_team_id, updated_at = now()
  where id = p_post_id and game_id = p_game_id;

  -- Selesai: if they had a deferred raid lock and no post still holds them, lock now.
  if p_team_id is null and was_serving is not null then
    if not exists (
      select 1 from posts where game_id = p_game_id and serving_team_id = was_serving
    ) then
      update teams set
        raid_locked_by = raid_lock_pending_by,
        raid_unlock_code = raid_lock_pending_code,
        raid_lock_pending_by = null,
        raid_lock_pending_code = null
      where id = was_serving and raid_lock_pending_by is not null;
    end if;
  end if;

  return _with_now(_finish(p_action_id, _ok()));
end $$;

------------------------------------------------------------------------------
-- unlock: accept active OR still-pending unlock codes
------------------------------------------------------------------------------
create or replace function unlock_raid_victim(
  p_action_id uuid, p_game_id uuid, p_attacker_id uuid, p_code text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  def teams;
begin
  r := _begin_request(p_action_id, p_game_id, 'unlock_raid_victim');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  if g.status = 'ended' then
    return _with_now(_finish(p_action_id, _err('GAME_OVER')));
  end if;

  select * into def from teams
  where game_id = g.id
    and (
      (raid_locked_by = p_attacker_id and raid_unlock_code = p_code)
      or (raid_lock_pending_by = p_attacker_id and raid_lock_pending_code = p_code)
    )
  for update;

  if def.id is null then
    return _with_now(_finish(p_action_id, _err('WRONG_UNLOCK_CODE')));
  end if;

  perform _raid_release_lock(def.id);

  perform _log(g, p_action_id, 'team', null, p_attacker_id, def.id, 'raid_unlock', 0, null,
               jsonb_build_object('team', def.name, 'other',
                 (select name from teams where id = p_attacker_id)));

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object('team', def.name))));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function _pass_game_id() to authenticated;
grant execute on function current_prices(uuid) to authenticated;
grant execute on function game_scores(uuid) to authenticated;
