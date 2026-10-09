-- Trial 3 P0 fixes: auto_fire default on, supply_ship stock cap + MC feed
-- lines for events, market_sale schedule skip, post/team active gates,
-- serving claim exclusivity, lookup/join hide inactive roles.

alter table games alter column auto_fire set default true;
update games set auto_fire = true where status in ('setup', 'ready');

------------------------------------------------------------------------------
-- create_game: new games get auto_fire = true (from migration 17)
------------------------------------------------------------------------------
create or replace function create_game(
  p_action_id uuid,
  p_config jsonb default null,
  p_name text default 'Game',
  p_host_tag text default null
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  gid uuid;
  gcode text;
  gname text;
  mc_tok text;
  mc_pin text;
begin
  r := _begin_request(p_action_id, null, 'create_game');
  if r is not null then return _with_now(r); end if;

  gname := left(trim(coalesce(p_name, 'Game')), 40);
  if gname = '' then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  gcode := _new_game_code();
  insert into games (code, config, name, host_tag, expires_at, auto_fire)
  values (gcode, coalesce(p_config, default_config()), gname, p_host_tag, now() + interval '7 days', true)
  returning id into gid;
  update requests set game_id = gid where action_id = p_action_id;

  insert into teams (game_id, slot, name, color) values
    (gid, 1, 'Bears',     'red'),
    (gid, 2, 'Magpies',   'blue'),
    (gid, 3, 'Pangolins', 'amber'),
    (gid, 4, 'Macaques',  'green'),
    (gid, 5, 'Pheasants', 'purple');

  insert into posts (game_id, kind, name) values
    (gid, 'shipwright',   'Tukang Kapal'),
    (gid, 'sailmaker',    'Trivia'),
    (gid, 'cartographer', 'Kartografer'),
    (gid, 'inn',          'Pondok Pelabuhan'),
    (gid, 'blacksmith',   'Pandai Besi');

  perform _init_play_state(gid);
  perform _make_role_tokens(gid, true);

  select token, pin into mc_tok, mc_pin from role_tokens where game_id = gid and role = 'mc';
  r := _ok(jsonb_build_object(
    'game_id', gid, 'code', gcode, 'name', gname,
    'mc_token', mc_tok, 'mc_pin', mc_pin
  ));
  return _with_now(_finish(p_action_id, r));
end $$;

------------------------------------------------------------------------------
-- fire_event (from migration 18): supply cap, MC feed, market_sale skip
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
  v_stock_start int;
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
    v_stock_start := (g.config->>'stock_start')::int;
    update stock set qty = least(v_stock_start, qty + (g.config->>'supply_ship_add')::int)
      where game_id = g.id;
    v_payload := jsonb_build_object(
      'add', (g.config->>'supply_ship_add')::int,
      'capped_at', v_stock_start
    );

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
      if p_schedule_index is not null then
        v_payload := jsonb_build_object('skipped', true, 'reason', 'NO_SALE_PART');
        insert into world_events (game_id, kind, payload, schedule_index, starts_at, ends_at)
        values (g.id, 'market_sale', v_payload, p_schedule_index, now(), null);
        for t in select id from teams where game_id = g.id and active loop
          perform _log(g, p_action_id, 'mc', null, null, t.id, 'event', 0, null,
                       jsonb_build_object('event', p_kind) || v_payload);
        end loop;
        return _with_now(_finish(p_action_id, _ok(v_payload)));
      end if;
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

  -- MC feed / journey lines for fired events (lighthouse already logged per team).
  if p_kind in ('supply_ship', 'storm', 'gold_rush', 'market_sale', 'pirate_hour', 'bounty', 'last_call', 'message') then
    for t in select id from teams where game_id = g.id and active loop
      perform _log(g, p_action_id, 'mc', null, null, t.id, 'event', 0, null,
                   jsonb_build_object('event', p_kind) || v_payload);
    end loop;
  end if;

  return _with_now(_finish(p_action_id, _ok(v_payload)));
end $$;

------------------------------------------------------------------------------
-- set_serving (from migration 18): POST_OFF / TEAM_OFF / TEAM_BUSY
------------------------------------------------------------------------------
create or replace function set_serving(p_action_id uuid, p_game_id uuid, p_post_id uuid, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  t teams;
  p posts;
  other_post text;
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
    select name into other_post from posts
      where game_id = p_game_id and serving_team_id = p_team_id and id <> p_post_id and active;
    if other_post is not null then
      return _with_now(_finish(p_action_id, _err('TEAM_BUSY',
        jsonb_build_object('team', t.name, 'post', other_post))));
    end if;
  end if;
  update posts set serving_team_id = p_team_id, updated_at = now()
  where id = p_post_id and game_id = p_game_id;
  return _with_now(_finish(p_action_id, _ok()));
end $$;

------------------------------------------------------------------------------
-- record_job / buy_item (from migration 17): active + serving gates
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
  if not p.active then
    return _with_now(_finish(p_action_id, _err('POST_OFF', jsonb_build_object('post', p.name))));
  end if;
  if not t.active then
    return _with_now(_finish(p_action_id, _err('TEAM_OFF', jsonb_build_object('team', t.name))));
  end if;
  if p.serving_team_id is distinct from t.id then
    return _with_now(_finish(p_action_id, _err('NOT_SERVING', jsonb_build_object('team', t.name))));
  end if;

  if t.raid_locked_by is not null then
    return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', t.name))));
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
    'team', t.name, 'amount', amount, 'doubled', doubled,
    'gold_rush', bonus > 0, 'gold', t.gold + amount))));
end $$;

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
  if not p.active then
    return _with_now(_finish(p_action_id, _err('POST_OFF', jsonb_build_object('post', p.name))));
  end if;
  if not t.active then
    return _with_now(_finish(p_action_id, _err('TEAM_OFF', jsonb_build_object('team', t.name))));
  end if;
  if p.serving_team_id is distinct from t.id then
    return _with_now(_finish(p_action_id, _err('NOT_SERVING', jsonb_build_object('team', t.name))));
  end if;

  if t.raid_locked_by is not null then
    return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', t.name))));
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
-- lookup_game + join_with_pin: only active teams/posts
------------------------------------------------------------------------------
create or replace function lookup_game(p_code text, p_ip text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  roles jsonb;
begin
  r := _rate_hit('lookup:' || coalesce(nullif(trim(p_ip), ''), 'unknown'), 30, 600, 600);
  if r is not null then return _with_now(r); end if;

  select * into g from games where code = upper(trim(coalesce(p_code, '')));
  if g.id is null then
    return _with_now(_err('GAME_NOT_FOUND'));
  end if;

  select coalesce(jsonb_agg(q.x order by q.ord), '[]'::jsonb) into roles
  from (
    select 0 as ord, jsonb_build_object('role', 'mc', 'label', 'MC') as x
    union all
    select t.slot, jsonb_build_object(
      'role', 'team', 'slot', t.slot, 'name', t.name, 'color', t.color
    ) as x
    from teams t where t.game_id = g.id and t.active
    union all
    select 100 + row_number() over (order by p.kind), jsonb_build_object(
      'role', 'post', 'kind', p.kind, 'name', p.name
    ) as x
    from posts p where p.game_id = g.id and p.active
  ) q;

  return _with_now(_ok(jsonb_build_object(
    'code', g.code, 'name', g.name, 'status', g.status, 'roles', roles
  )));
end $$;

create or replace function join_with_pin(
  p_code text, p_role text, p_slot int, p_post_kind text, p_pin text, p_device_id text, p_ip text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  rt role_tokens;
  pin_key text;
  role_key text;
  given text;
  v_team_id uuid;
  v_post_id uuid;
  t teams;
  p posts;
begin
  select * into g from games where code = upper(trim(coalesce(p_code, '')));
  if g.id is null then
    return _with_now(_err('GAME_NOT_FOUND'));
  end if;

  pin_key := 'pin:' || coalesce(nullif(trim(p_ip), ''), 'unknown') || ':' || g.id::text;

  if p_role = 'mc' then
    select * into rt from role_tokens where game_id = g.id and role = 'mc';
  elsif p_role = 'team' then
    select id into v_team_id from teams where game_id = g.id and slot = p_slot;
    select * into rt from role_tokens where game_id = g.id and role = 'team' and team_id = v_team_id;
  elsif p_role = 'post' then
    select id into v_post_id from posts where game_id = g.id and kind = p_post_kind;
    select * into rt from role_tokens where game_id = g.id and role = 'post' and post_id = v_post_id;
  else
    return _with_now(_err('BAD_INPUT'));
  end if;

  if rt.token is null then
    return _with_now(_err('BAD_INPUT'));
  end if;

  if p_role = 'team' then
    select * into t from teams where id = v_team_id;
    if t.id is not null and not t.active then
      return _with_now(_err('TEAM_OFF', jsonb_build_object('team', t.name)));
    end if;
  elsif p_role = 'post' then
    select * into p from posts where id = v_post_id;
    if p.id is not null and not p.active then
      return _with_now(_err('POST_OFF', jsonb_build_object('post', p.name)));
    end if;
  end if;

  role_key := 'pinrole:' || rt.id::text;

  r := _rate_locked(pin_key);
  if r is not null then return _with_now(r); end if;
  r := _rate_locked(role_key);
  if r is not null then return _with_now(r); end if;

  given := upper(trim(coalesce(p_pin, '')));
  if given is distinct from upper(rt.pin) then
    r := _rate_hit(pin_key, 5, 600, 60, true);
    if r is not null then return _with_now(r); end if;
    r := _rate_hit(role_key, 20, 600, 300, false);
    if r is not null then return _with_now(r); end if;
    return _with_now(_err('WRONG_PIN', jsonb_build_object(
      'tries_left',
      greatest(0, 5 - coalesce((select hits from rate_limits where key = pin_key), 0))
    )));
  end if;

  perform _rate_clear(pin_key);

  update role_tokens
  set devices = coalesce(devices, '{}'::jsonb) || jsonb_build_object(coalesce(nullif(p_device_id, ''), 'unknown'), now()),
      last_seen_at = now()
  where token = rt.token;

  return _with_now(_ok(jsonb_build_object(
    'token', rt.token, 'role', rt.role, 'game_id', g.id, 'game_code', g.code, 'game_name', g.name,
    'team_id', rt.team_id, 'post_id', rt.post_id
  )));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function _pass_game_id() to authenticated;
grant execute on function current_prices(uuid) to authenticated;
grant execute on function game_scores(uuid) to authenticated;
