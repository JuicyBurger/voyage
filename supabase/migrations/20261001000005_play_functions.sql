-- Clock, prices, game control, jobs, buying, undo, line status, Double Profit.

-- Event clock in milliseconds (minute 5:00 = 300000 at Start).
create or replace function _event_ms(g games) returns bigint
language sql stable as $$
  select case
    when g.started_at is null then ((g.config->'clock'->>'play_start_minute')::numeric * 60000)::bigint
    else ((g.config->'clock'->>'play_start_minute')::numeric * 60000
          + (extract(epoch from (coalesce(g.paused_at, g.ended_at, now()) - g.started_at)) * 1000
             - g.paused_ms_total) * g.speed)::bigint
  end
$$;

-- Real time for a number of event minutes (shorter in rehearsal).
create or replace function _real_interval(g games, p_minutes numeric) returns interval
language sql stable as $$ select make_interval(secs => p_minutes * 60 / g.speed) $$;

create or replace function _active_event(p_game_id uuid, p_kind text) returns world_events
language sql stable as $$
  select * from world_events
  where game_id = p_game_id and kind = p_kind and cancelled_at is null
    and ends_at is not null and starts_at <= now() and ends_at > now()
  order by created_at desc limit 1
$$;

-- Returns an error if nobody may act right now, else null. p_what: 'job' | 'sale' | 'raid'.
create or replace function _check_can_act(g games, p_what text) returns jsonb
language plpgsql stable as $$
declare storm world_events;
begin
  if g.status in ('setup', 'ready') then return _err('NOT_STARTED'); end if;
  if g.status = 'ended' then return _err('GAME_OVER'); end if;
  if g.paused_at is not null then return _err('PAUSED'); end if;
  storm := _active_event(g.id, 'storm');
  if storm.id is not null then
    return _err('STORM', jsonb_build_object('seconds_left', ceil(extract(epoch from storm.ends_at - now()))));
  end if;
  if p_what = 'raid' and g.status = 'last_call' then return _err('LAST_CALL'); end if;
  return null;
end $$;

create or replace function _log(
  g games, p_request uuid, p_actor_role text, p_actor_post uuid, p_actor_team uuid,
  p_team uuid, p_kind text, p_amount int, p_item text, p_details jsonb
) returns uuid language plpgsql as $$
declare new_id uuid;
begin
  insert into actions (game_id, request_id, actor_role, actor_post_id, actor_team_id, team_id,
                       kind, amount, item, details)
  values (g.id, p_request, p_actor_role, p_actor_post, p_actor_team, p_team,
          p_kind, p_amount, p_item, coalesce(p_details, '{}'::jsonb) || jsonb_build_object('minute_ms', _event_ms(g)))
  returning id into new_id;
  return new_id;
end $$;

create or replace function _part_price(g games, p_part text) returns int
language plpgsql stable as $$
declare
  price numeric := (g.config->'parts'->p_part->>'price')::int;
  sale world_events;
begin
  if g.price_dial_percent is not null then
    price := round(price * (100 + g.price_dial_percent) / 100.0);
  end if;
  sale := _active_event(g.id, 'market_sale');
  if sale.id is not null and sale.payload->>'part' = p_part then
    price := greatest(1, price - (g.config->'events'->>'market_sale_discount')::int);
  end if;
  return price::int;
end $$;

create or replace function _item_price(g games, p_item text) returns int
language sql stable as $$
  select case when p_item in ('hull','mast','sail','map') then _part_price(g, p_item)
              else (g.config->'items'->p_item->>'price')::int end
$$;

-- Prices right now, for every screen. Safe for anon: only reads public data.
create or replace function current_prices(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare g games;
begin
  select * into g from games where id = p_game_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'hull', _item_price(g, 'hull'), 'mast', _item_price(g, 'mast'),
    'sail', _item_price(g, 'sail'), 'map', _item_price(g, 'map'),
    'flag', _item_price(g, 'flag'), 'sword', _item_price(g, 'sword'), 'shield', _item_price(g, 'shield'));
end $$;

-- Next scheduled Supply Ship minute that has not fired yet (for the "no stock" message).
create or replace function _next_supply_minute(g games) returns numeric
language sql stable as $$
  select min((e.value->>'minute')::numeric)
  from jsonb_array_elements(g.config->'schedule') with ordinality as e(value, idx)
  where e.value->>'kind' = 'supply_ship'
    and (e.value->>'minute')::numeric * 60000 > _event_ms(g)
    and not exists (select 1 from world_events w
                    where w.game_id = g.id and w.schedule_index = e.idx - 1 and w.cancelled_at is null)
$$;

------------------------------------------------------------------------------
-- Game control: ready, unready, start, pause, resume, last_call, end
------------------------------------------------------------------------------
create or replace function game_control(p_action_id uuid, p_game_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  pause_len interval;
begin
  r := _begin_request(p_action_id, p_game_id, 'game_control');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;

  if p_action = 'ready' and g.status = 'setup' then
    update games set status = 'ready' where id = g.id;

  elsif p_action = 'unready' and g.status = 'ready' then
    update games set status = 'setup' where id = g.id;

  elsif p_action = 'start' and g.status = 'ready' then
    update games set status = 'running', started_at = now(), paused_at = null, paused_ms_total = 0
    where id = g.id;

  elsif p_action = 'pause' and g.status in ('running', 'last_call') and g.paused_at is null then
    update games set paused_at = now() where id = g.id;

  elsif p_action = 'resume' and g.paused_at is not null and g.status <> 'ended' then
    pause_len := now() - g.paused_at;
    -- Timers do not run during a pause: push them back by the pause length.
    update world_events set ends_at = ends_at + pause_len
      where game_id = g.id and cancelled_at is null and ends_at > g.paused_at;
    update teams set immune_until = immune_until + pause_len
      where game_id = g.id and immune_until > g.paused_at;
    update team_secrets set raid_blocked_until = raid_blocked_until + pause_len
      where game_id = g.id and raid_blocked_until > g.paused_at;
    update games set paused_at = null,
      paused_ms_total = paused_ms_total + (extract(epoch from pause_len) * 1000)::bigint
    where id = g.id;

  elsif p_action = 'last_call' and g.status = 'running' then
    update games set status = 'last_call' where id = g.id;
    insert into world_events (game_id, kind) values (g.id, 'last_call');

  elsif p_action = 'end' and g.status in ('running', 'last_call') then
    update games set
      status = 'ended', ended_at = now(), paused_at = null,
      paused_ms_total = paused_ms_total
        + coalesce((extract(epoch from now() - g.paused_at) * 1000)::bigint, 0)
    where id = g.id;
    update world_events set ends_at = now()
      where game_id = g.id and cancelled_at is null and ends_at > now();
    insert into world_events (game_id, kind) values (g.id, 'end');

  else
    return _with_now(_finish(p_action_id, _err('BAD_STATE', jsonb_build_object('status', g.status))));
  end if;

  return _with_now(_finish(p_action_id, _ok()));
end $$;

------------------------------------------------------------------------------
-- Jobs
------------------------------------------------------------------------------
create or replace function record_job(
  p_action_id uuid, p_game_id uuid, p_post_id uuid, p_team_id uuid, p_passed boolean
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  p posts;
  t teams;
  done_here int;
  limit_here int;
  base int;
  bonus int := 0;
  amount int;
  doubled boolean := false;
  rush world_events;
begin
  r := _begin_request(p_action_id, p_game_id, 'record_job');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  select * into p from posts where id = p_post_id and game_id = p_game_id;
  select * into t from teams where id = p_team_id and game_id = p_game_id for update;
  if p.id is null or t.id is null then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  r := _check_can_act(g, 'job');
  if r is not null then return _with_now(_finish(p_action_id, r)); end if;

  select count into done_here from job_counts where team_id = t.id and post_id = p.id for update;
  limit_here := (g.config->>'jobs_per_post')::int;
  if done_here >= limit_here then
    return _with_now(_finish(p_action_id,
      _err('JOB_LIMIT', jsonb_build_object('team', t.name, 'limit', limit_here))));
  end if;

  if p_passed then
    base := (g.config->'job_pay'->>p.kind)::int;
    rush := _active_event(g.id, 'gold_rush');
    if rush.id is not null then bonus := (g.config->'events'->>'gold_rush_bonus')::int; end if;
    amount := base + bonus;
    if t.double_armed then
      amount := amount * 2;
      doubled := true;
    end if;
  else
    amount := (g.config->>'fail_pay')::int;
  end if;

  update teams set
    gold = gold + amount,
    double_armed = case when doubled then false else double_armed end,
    double_used  = case when doubled then true  else double_used  end
  where id = t.id;
  update job_counts set count = count + 1 where team_id = t.id and post_id = p.id;

  perform _log(g, p_action_id, 'post', p.id, null, t.id,
               case when p_passed then 'job_pass' else 'job_fail' end, amount, null,
               jsonb_build_object('post_kind', p.kind, 'post_name', p.name,
                                  'gold_rush', bonus > 0, 'doubled', doubled));

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object(
    'team', t.name, 'amount', amount, 'doubled', doubled, 'gold', t.gold + amount))));
end $$;

------------------------------------------------------------------------------
-- Buying
------------------------------------------------------------------------------
create or replace function buy_item(
  p_action_id uuid, p_game_id uuid, p_post_id uuid, p_team_id uuid, p_item text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  p posts;
  t teams;
  price int;
  seller text;
  v_qty int;
  v_rank int;
  bonus int;
  is_part boolean := p_item in ('hull','mast','sail','map');
  boat_now boolean;
begin
  r := _begin_request(p_action_id, p_game_id, 'buy_item');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  select * into p from posts where id = p_post_id and game_id = p_game_id;
  select * into t from teams where id = p_team_id and game_id = p_game_id for update;
  if p.id is null or t.id is null or p_item not in ('hull','mast','sail','map','flag','sword','shield') then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  r := _check_can_act(g, 'sale');
  if r is not null then return _with_now(_finish(p_action_id, r)); end if;

  seller := case when is_part then g.config->'parts'->p_item->>'post' else 'blacksmith' end;
  if seller <> p.kind then
    return _with_now(_finish(p_action_id, _err('WRONG_POST', jsonb_build_object('item', p_item))));
  end if;

  if (p_item = 'hull' and t.has_hull) or (p_item = 'mast' and t.has_mast)
     or (p_item = 'sail' and t.has_sail) or (p_item = 'map' and t.has_map)
     or (p_item = 'flag' and t.has_flag) or (p_item = 'sword' and t.has_sword) then
    return _with_now(_finish(p_action_id,
      _err('ALREADY_OWNED', jsonb_build_object('team', t.name, 'item', p_item))));
  end if;
  if p_item = 'shield' and t.shield_count >= 1 then
    return _with_now(_finish(p_action_id, _err('HAS_SHIELD', jsonb_build_object('team', t.name))));
  end if;

  if is_part then
    select s.qty into v_qty from stock s where s.game_id = g.id and s.part = p_item for update;
    if v_qty <= 0 then
      return _with_now(_finish(p_action_id, _err('NO_STOCK',
        jsonb_build_object('item', p_item, 'supply_minute', _next_supply_minute(g)))));
    end if;
  end if;

  price := _item_price(g, p_item);
  if t.gold < price then
    return _with_now(_finish(p_action_id, _err('NOT_ENOUGH_GOLD',
      jsonb_build_object('team', t.name, 'item', p_item, 'need', price, 'have', t.gold))));
  end if;

  if is_part then
    update stock set qty = qty - 1 where game_id = g.id and part = p_item;
  end if;

  update teams set
    gold = gold - price,
    has_hull = has_hull or p_item = 'hull',
    has_mast = has_mast or p_item = 'mast',
    has_sail = has_sail or p_item = 'sail',
    has_map  = has_map  or p_item = 'map',
    has_flag = has_flag or p_item = 'flag',
    raids_left = case when p_item = 'flag' then (g.config->'items'->'flag'->>'raids')::int else raids_left end,
    has_sword = has_sword or p_item = 'sword',
    shield_count = case when p_item = 'shield' then 1 else shield_count end
  where id = t.id
  returning (has_hull and has_mast and has_sail and has_map) into boat_now;

  perform _log(g, p_action_id, 'post', p.id, null, t.id, 'buy', -price, p_item,
               jsonb_build_object('post_kind', p.kind, 'post_name', p.name, 'price', price));

  if boat_now and t.boat_done_at is null then
    select count(*) + 1 into v_rank from teams where game_id = g.id and boat_done_at is not null;
    bonus := coalesce((g.config->'scoring'->'finish_order'->>(v_rank - 1))::int, 0);
    update teams set boat_done_at = now(), boat_rank = v_rank where id = t.id;
    insert into world_events (game_id, kind, payload)
    values (g.id, 'boat_finished', jsonb_build_object('team_id', t.id, 'team', t.name, 'rank', v_rank, 'bonus', bonus));
    perform _log(g, p_action_id, 'post', p.id, null, t.id, 'boat_done', 0, null,
                 jsonb_build_object('rank', v_rank, 'bonus', bonus));
  end if;

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object(
    'team', t.name, 'item', p_item, 'price', price, 'gold', t.gold - price,
    'boat_rank', case when boat_now and t.boat_done_at is null then v_rank end))));
end $$;

------------------------------------------------------------------------------
-- Undo this post's last job or sale (within 2 minutes)
------------------------------------------------------------------------------
create or replace function undo_last(p_action_id uuid, p_game_id uuid, p_post_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  a actions;
  t teams;
  old_rank int;
begin
  r := _begin_request(p_action_id, p_game_id, 'undo_last');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  if g.status = 'ended' then return _with_now(_finish(p_action_id, _err('GAME_OVER'))); end if;

  select * into a from actions
  where game_id = g.id and actor_post_id = p_post_id and undone_at is null
    and kind in ('job_pass', 'job_fail', 'buy')
  order by created_at desc limit 1;

  if a.id is null or a.created_at < now() - interval '2 minutes' then
    return _with_now(_finish(p_action_id, _err('NOTHING_TO_UNDO')));
  end if;

  select * into t from teams where id = a.team_id for update;

  if a.kind in ('job_pass', 'job_fail') then
    if t.gold < a.amount then
      return _with_now(_finish(p_action_id, _err('UNDO_NO_GOLD', jsonb_build_object('team', t.name))));
    end if;
    update teams set
      gold = gold - a.amount,
      double_armed = case when (a.details->>'doubled')::boolean then true  else double_armed end,
      double_used  = case when (a.details->>'doubled')::boolean then false else double_used  end
    where id = t.id;
    update job_counts set count = greatest(0, count - 1) where team_id = t.id and post_id = p_post_id;
    perform _log(g, p_action_id, 'post', p_post_id, null, t.id, 'undo', -a.amount, null,
                 jsonb_build_object('undid', a.kind, 'post_name', a.details->>'post_name'));

  else
    if a.item = 'flag' and t.raids_left < (g.config->'items'->'flag'->>'raids')::int then
      return _with_now(_finish(p_action_id, _err('UNDO_FLAG_USED', jsonb_build_object('team', t.name))));
    end if;
    if a.item = 'shield' and t.shield_count < 1 then
      return _with_now(_finish(p_action_id, _err('UNDO_SHIELD_USED', jsonb_build_object('team', t.name))));
    end if;

    old_rank := t.boat_rank;
    update teams set
      gold = gold - a.amount,  -- a.amount is negative for a sale
      has_hull = has_hull and a.item <> 'hull',
      has_mast = has_mast and a.item <> 'mast',
      has_sail = has_sail and a.item <> 'sail',
      has_map  = has_map  and a.item <> 'map',
      has_flag = has_flag and a.item <> 'flag',
      raids_left = case when a.item = 'flag' then 0 else raids_left end,
      has_sword = has_sword and a.item <> 'sword',
      shield_count = case when a.item = 'shield' then 0 else shield_count end,
      boat_done_at = case when a.item in ('hull','mast','sail','map') then null else boat_done_at end,
      boat_rank    = case when a.item in ('hull','mast','sail','map') then null else boat_rank end
    where id = t.id;

    if a.item in ('hull','mast','sail','map') then
      update stock set qty = qty + 1 where game_id = g.id and part = a.item;
      if old_rank is not null then
        update teams set boat_rank = boat_rank - 1 where game_id = g.id and boat_rank > old_rank;
        update world_events set cancelled_at = now()
          where game_id = g.id and kind = 'boat_finished' and payload->>'team_id' = t.id::text
            and cancelled_at is null;
      end if;
    end if;

    perform _log(g, p_action_id, 'post', p_post_id, null, t.id, 'undo', -a.amount, a.item,
                 jsonb_build_object('undid', 'buy', 'post_name', a.details->>'post_name'));
  end if;

  update actions set undone_at = now() where id = a.id;
  update actions set undo_of = a.id where request_id = p_action_id and kind = 'undo';

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object('team', t.name, 'undid', a.kind, 'item', a.item))));
end $$;

------------------------------------------------------------------------------
-- Line status
------------------------------------------------------------------------------
create or replace function set_serving(p_action_id uuid, p_game_id uuid, p_post_id uuid, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_serving');
  if r is not null then return _with_now(r); end if;
  if p_team_id is not null and not exists (select 1 from teams where id = p_team_id and game_id = p_game_id) then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;
  update posts set serving_team_id = p_team_id, updated_at = now()
  where id = p_post_id and game_id = p_game_id;
  return _with_now(_finish(p_action_id, _ok()));
end $$;

create or replace function set_waiting(p_action_id uuid, p_game_id uuid, p_post_id uuid, p_count int)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_waiting');
  if r is not null then return _with_now(r); end if;
  update posts set waiting_count = greatest(0, least(p_count, 99)), updated_at = now()
  where id = p_post_id and game_id = p_game_id;
  return _with_now(_finish(p_action_id, _ok()));
end $$;

------------------------------------------------------------------------------
-- Double Profit
------------------------------------------------------------------------------
create or replace function arm_double(p_action_id uuid, p_game_id uuid, p_team_id uuid, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  t teams;
begin
  r := _begin_request(p_action_id, p_game_id, 'arm_double');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  select * into t from teams where id = p_team_id and game_id = p_game_id for update;
  if g.status = 'ended' then return _with_now(_finish(p_action_id, _err('GAME_OVER'))); end if;
  if t.double_used then return _with_now(_finish(p_action_id, _err('DOUBLE_USED'))); end if;
  if t.double_armed = p_on then return _with_now(_finish(p_action_id, _ok())); end if;

  update teams set double_armed = p_on where id = t.id;
  perform _log(g, p_action_id, 'team', null, t.id, t.id,
               case when p_on then 'double_on' else 'double_off' end, 0, null, '{}'::jsonb);
  return _with_now(_finish(p_action_id, _ok()));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function current_prices(uuid) to anon, authenticated;
