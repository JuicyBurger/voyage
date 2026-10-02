-- World events, price dial, MC adjust, MC options.

-- After the MC changes parts, make boat_done_at / boat_rank match.
create or replace function _sync_boat(g games, p_request uuid, p_team_id uuid) returns void
language plpgsql as $$
declare
  t teams;
  v_rank int;
  bonus int;
  complete boolean;
begin
  select * into t from teams where id = p_team_id;
  complete := t.has_hull and t.has_mast and t.has_sail and t.has_map;

  if complete and t.boat_done_at is null then
    select count(*) + 1 into v_rank from teams where game_id = g.id and boat_done_at is not null;
    bonus := coalesce((g.config->'scoring'->'finish_order'->>(v_rank - 1))::int, 0);
    update teams set boat_done_at = now(), boat_rank = v_rank where id = t.id;
    insert into world_events (game_id, kind, payload)
    values (g.id, 'boat_finished', jsonb_build_object('team_id', t.id, 'team', t.name, 'rank', v_rank, 'bonus', bonus));
    perform _log(g, p_request, 'mc', null, null, t.id, 'boat_done', 0, null,
                 jsonb_build_object('rank', v_rank, 'bonus', bonus));

  elsif not complete and t.boat_done_at is not null then
    update teams set boat_done_at = null, boat_rank = null where id = t.id;
    update teams set boat_rank = boat_rank - 1 where game_id = g.id and boat_rank > t.boat_rank;
    update world_events set cancelled_at = now()
      where game_id = g.id and kind = 'boat_finished' and payload->>'team_id' = t.id::text and cancelled_at is null;
  end if;
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
    select jsonb_agg(name order by slot) into names from teams where game_id = g.id and gold = v_max;
    v_payload := jsonb_build_object('teams', names, 'bonus', (ev->>'bounty_bonus')::int);

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

-- End a timed event early. The event still counts as fired for the schedule.
create or replace function cancel_event(p_action_id uuid, p_game_id uuid, p_event_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  r := _begin_request(p_action_id, p_game_id, 'cancel_event');
  if r is not null then return _with_now(r); end if;
  perform 1 from games where id = p_game_id for update;
  update world_events set ends_at = now(), payload = payload || '{"stopped": true}'::jsonb
    where id = p_event_id and game_id = p_game_id and cancelled_at is null and ends_at > now();
  if not found then return _with_now(_finish(p_action_id, _err('NOTHING_TO_STOP'))); end if;
  return _with_now(_finish(p_action_id, _ok()));
end $$;

-- Price dial: null = off, or minus / plus the configured percent.
create or replace function set_price_dial(p_action_id uuid, p_game_id uuid, p_direction int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  pct int;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_price_dial');
  if r is not null then return _with_now(r); end if;
  select * into g from games where id = p_game_id for update;
  if g.status = 'ended' then return _with_now(_finish(p_action_id, _err('GAME_OVER'))); end if;

  pct := case when p_direction is null or p_direction = 0 then null
              else sign(p_direction) * (g.config->'events'->>'price_dial_percent')::int end;
  if pct is not distinct from g.price_dial_percent then return _with_now(_finish(p_action_id, _ok())); end if;

  update games set price_dial_percent = pct where id = g.id;
  if g.status in ('running', 'last_call') then
    insert into world_events (game_id, kind, payload) values (g.id, 'price_dial', jsonb_build_object('percent', pct));
  end if;
  return _with_now(_finish(p_action_id, _ok(jsonb_build_object('percent', pct))));
end $$;

------------------------------------------------------------------------------
-- mc_adjust: the MC fixes a number. Gold is a change (+5, -10); everything
-- else is a new value. Always logged with a reason.
------------------------------------------------------------------------------
create or replace function mc_adjust(
  p_action_id uuid, p_game_id uuid, p_team_id uuid, p_field text, p_value int, p_reason text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  t teams;
  old_value int;
  gold_change int := 0;
begin
  r := _begin_request(p_action_id, p_game_id, 'mc_adjust');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  select * into t from teams where id = p_team_id and game_id = p_game_id for update;
  if t.id is null then return _with_now(_finish(p_action_id, _err('BAD_INPUT'))); end if;
  if coalesce(trim(p_reason), '') = '' then return _with_now(_finish(p_action_id, _err('NEED_REASON'))); end if;
  if g.reveal_step is not null then return _with_now(_finish(p_action_id, _err('REVEAL_LOCKED'))); end if;

  case p_field
    when 'gold' then
      old_value := t.gold;
      if t.gold + p_value < 0 then
        return _with_now(_finish(p_action_id, _err('NEGATIVE_GOLD', jsonb_build_object('team', t.name, 'have', t.gold))));
      end if;
      gold_change := p_value;
      update teams set gold = gold + p_value where id = t.id;
    when 'raids_left' then
      old_value := t.raids_left;
      update teams set raids_left = greatest(0, p_value) where id = t.id;
    when 'raid_wins' then
      old_value := t.raid_wins;
      update teams set raid_wins = greatest(0, p_value) where id = t.id;
    when 'shield_count' then
      old_value := t.shield_count;
      update teams set shield_count = least(1, greatest(0, p_value)) where id = t.id;
    when 'has_hull' then old_value := t.has_hull::int; update teams set has_hull = p_value > 0 where id = t.id;
    when 'has_mast' then old_value := t.has_mast::int; update teams set has_mast = p_value > 0 where id = t.id;
    when 'has_sail' then old_value := t.has_sail::int; update teams set has_sail = p_value > 0 where id = t.id;
    when 'has_map'  then old_value := t.has_map::int;  update teams set has_map  = p_value > 0 where id = t.id;
    when 'has_flag' then old_value := t.has_flag::int; update teams set has_flag = p_value > 0 where id = t.id;
    when 'has_sword' then old_value := t.has_sword::int; update teams set has_sword = p_value > 0 where id = t.id;
    else
      return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end case;

  perform _log(g, p_action_id, 'mc', null, null, t.id, 'adjust', gold_change, null,
               jsonb_build_object('field', p_field, 'old', old_value, 'value', p_value, 'reason', trim(p_reason)));

  if p_field in ('has_hull', 'has_mast', 'has_sail', 'has_map') then
    perform _sync_boat(g, p_action_id, t.id);
  end if;

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object('team', t.name))));
end $$;

-- On/off switches in the MC panel.
create or replace function set_option(p_action_id uuid, p_game_id uuid, p_name text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_option');
  if r is not null then return _with_now(r); end if;
  if p_name = 'auto_fire' then
    update games set auto_fire = p_on where id = p_game_id;
  elsif p_name = 'show_scores_on_tv' then
    update games set show_scores_on_tv = p_on where id = p_game_id;
  else
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;
  return _with_now(_finish(p_action_id, _ok()));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function current_prices(uuid) to anon, authenticated;
