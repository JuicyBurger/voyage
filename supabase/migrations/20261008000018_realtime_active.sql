-- Realtime: filtered UPDATEs need replica identity so game_id is in the payload.
-- Active flags: MC can park unused teams/posts for small games.

alter table teams add column if not exists active boolean not null default true;
alter table posts add column if not exists active boolean not null default true;

alter table teams replica identity full;
alter table posts replica identity full;
alter table stock replica identity full;
alter table job_counts replica identity full;
alter table world_events replica identity full;
alter table actions replica identity full;
alter table raids replica identity full;

-- Scores only count teams that are in play.
create or replace function game_scores(p_game_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with sc as (
    select config->'scoring' as s from games where id = p_game_id
  ),
  t as (
    select tm.*, (tm.has_hull::int + tm.has_mast::int + tm.has_sail::int + tm.has_map::int) as parts
    from teams tm where tm.game_id = p_game_id and tm.active
  ),
  most as (
    select coalesce(max(raid_wins), 0) as m from t
  ),
  pts as (
    select t.id as team_id, t.name, t.color, t.slot, t.gold, t.parts, t.raid_wins, t.boat_rank, t.boat_done_at,
      t.parts * (sc.s->>'per_part')::int as parts_points,
      case when t.boat_done_at is not null then (sc.s->>'boat_bonus')::int else 0 end as boat_points,
      coalesce((sc.s->'finish_order'->>(t.boat_rank - 1))::int, 0) as finish_points,
      floor(t.gold / (sc.s->>'gold_per_point')::numeric)::int as gold_points,
      t.raid_wins * (sc.s->>'per_raid_win')::int as raid_points,
      case when t.raid_wins = most.m and t.raid_wins >= (sc.s->>'most_raids_min')::int
           then (sc.s->>'most_raids_bonus')::int else 0 end as most_raids_points
    from t, sc, most
  ),
  totals as (
    select pts.*,
      parts_points + boat_points + finish_points + gold_points + raid_points + most_raids_points as total
    from pts
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.place), '[]'::jsonb)
  from (
    select totals.*,
      row_number() over (order by total desc, gold desc, boat_done_at asc nulls last, slot) as place
    from totals
  ) r
$$;

create or replace function update_setup(
  p_action_id uuid, p_game_id uuid,
  p_config jsonb default null, p_teams jsonb default null, p_posts jsonb default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  e jsonb;
begin
  r := _begin_request(p_action_id, p_game_id, 'update_setup');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  if g.status not in ('setup', 'ready') then
    return _with_now(_finish(p_action_id, _err('SETUP_LOCKED')));
  end if;
  if p_config is not null and g.status <> 'setup' then
    return _with_now(_finish(p_action_id, _err('CONFIG_LOCKED')));
  end if;

  if p_config is not null then
    update games set config = p_config where id = p_game_id;
    if g.status = 'setup' then
      perform _init_play_state(p_game_id);
    end if;
  end if;

  for e in select * from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) loop
    update teams set
      name = e->>'name',
      color = e->>'color',
      active = coalesce((e->>'active')::boolean, active)
    where id = (e->>'id')::uuid and game_id = p_game_id;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_posts, '[]'::jsonb)) loop
    update posts set
      name = e->>'name',
      staff_name = nullif(e->>'staff_name', ''),
      active = coalesce((e->>'active')::boolean, active),
      updated_at = now()
    where id = (e->>'id')::uuid and game_id = p_game_id;
  end loop;

  return _with_now(_finish(p_action_id, _ok()));
end $$;

-- Lighthouse / Bounty only consider active teams (override fire_event from review_fixes).
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
    perform 1 from teams where game_id = g.id and active order by id for update;
    select min(gold) into v_min from teams where game_id = g.id and active;
    select jsonb_agg(name order by slot) into names from teams where game_id = g.id and active and gold = v_min;
    for t in select id from teams where game_id = g.id and active and gold = v_min loop
      update teams set gold = gold + aid where id = t.id;
      perform _log(g, p_action_id, 'mc', null, null, t.id, 'lighthouse', aid, null, '{}'::jsonb);
    end loop;
    v_payload := jsonb_build_object('teams', names, 'amount', aid);

  elsif p_kind = 'market_sale' then
    select s.part into v_part from stock s
    where s.game_id = g.id and s.qty > 0
      and exists (select 1 from teams x where x.game_id = g.id and x.active and not case s.part
                    when 'hull' then x.has_hull when 'mast' then x.has_mast
                    when 'sail' then x.has_sail else x.has_map end)
    order by random() limit 1;
    if v_part is null then
      return _with_now(_finish(p_action_id, _err('NO_SALE_PART')));
    end if;
    v_payload := jsonb_build_object('part', v_part, 'discount', (ev->>'market_sale_discount')::int);

  elsif p_kind = 'bounty' then
    select max(gold) into v_max from teams where game_id = g.id and active;
    select jsonb_agg(name order by slot), jsonb_agg(id order by slot)
      into names, ids
      from teams where game_id = g.id and active and gold = v_max;
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

  if minutes is not null then
    update world_events set ends_at = now()
      where game_id = g.id and kind = p_kind and cancelled_at is null and ends_at > now();
  end if;

  insert into world_events (game_id, kind, payload, schedule_index, starts_at, ends_at)
  values (g.id, p_kind, v_payload, p_schedule_index, now(),
          case when minutes is not null then now() + _real_interval(g, minutes) end);

  return _with_now(_finish(p_action_id, _ok(v_payload)));
end $$;

-- Refuse post actions for inactive teams; refuse serving inactive.
create or replace function set_serving(p_action_id uuid, p_game_id uuid, p_post_id uuid, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  t teams;
  p posts;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_serving');
  if r is not null then return _with_now(r); end if;

  select * into p from posts where id = p_post_id and game_id = p_game_id;
  if p.id is null then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;
  if not p.active then
    return _with_now(_finish(p_action_id, _err('BAD_STATE')));
  end if;

  if p_team_id is not null then
    select * into t from teams where id = p_team_id and game_id = p_game_id;
    if t.id is null then
      return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
    end if;
    if not t.active then
      return _with_now(_finish(p_action_id, _err('BAD_STATE')));
    end if;
    if t.raid_locked_by is not null then
      return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', t.name))));
    end if;
  end if;
  update posts set serving_team_id = p_team_id, updated_at = now()
  where id = p_post_id and game_id = p_game_id;
  return _with_now(_finish(p_action_id, _ok()));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function _pass_game_id() to authenticated;
grant execute on function current_prices(uuid) to authenticated;
grant execute on function game_scores(uuid) to authenticated;
