-- Multi-game hosts: game name, host tag, expiry, role PINs, rate limits, cleanup.

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------

alter table games
  add column if not exists name text not null default 'Game'
    check (char_length(name) between 1 and 40),
  add column if not exists host_tag text,
  add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

alter table role_tokens
  add column if not exists id uuid not null default gen_random_uuid(),
  add column if not exists pin text not null default '';

create unique index if not exists role_tokens_id_uidx on role_tokens (id);
create unique index if not exists role_tokens_game_pin_uidx on role_tokens (game_id, pin);

create table if not exists rate_limits (
  key           text primary key,
  window_start  timestamptz not null default now(),
  hits          int not null default 0 check (hits >= 0),
  locked_until  timestamptz,
  lock_seconds  int not null default 60 check (lock_seconds >= 0)
);

alter table rate_limits enable row level security;
revoke all on rate_limits from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- PIN helpers
-- ---------------------------------------------------------------------------

create or replace function _new_digit_pin(p_game_id uuid) returns text
language plpgsql volatile as $$
declare c text;
begin
  loop
    c := lpad(floor(random() * 1000000)::int::text, 6, '0');
    exit when not exists (select 1 from role_tokens where game_id = p_game_id and pin = c);
  end loop;
  return c;
end $$;

create or replace function _new_mc_pin(p_game_id uuid) returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  c text;
  i int;
begin
  loop
    c := '';
    for i in 1..8 loop
      c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from role_tokens where game_id = p_game_id and pin = c);
  end loop;
  return c;
end $$;

-- ---------------------------------------------------------------------------
-- Rate limits
-- ---------------------------------------------------------------------------

-- Returns null when allowed, or an _err(...) jsonb when blocked / just locked.
-- p_double: after a lock, next lock is twice as long (capped at 15 minutes).
create or replace function _rate_hit(
  p_key text,
  p_max int,
  p_window_secs int,
  p_lock_secs int,
  p_double boolean default false
) returns jsonb
language plpgsql as $$
declare
  r rate_limits;
  next_lock int;
  left_secs int;
  win interval := make_interval(secs => greatest(1, p_window_secs));
begin
  insert into rate_limits (key, window_start, hits, lock_seconds)
  values (p_key, now(), 0, greatest(60, p_lock_secs))
  on conflict (key) do nothing;

  select * into r from rate_limits where key = p_key for update;

  if r.locked_until is not null and r.locked_until > now() then
    left_secs := ceil(extract(epoch from r.locked_until - now()))::int;
    return _err('RATE_LIMITED', jsonb_build_object('seconds_left', left_secs));
  end if;

  if r.window_start + win <= now() then
    update rate_limits set window_start = now(), hits = 0 where key = p_key;
    r.hits := 0;
  end if;

  update rate_limits set hits = hits + 1 where key = p_key returning * into r;

  if r.hits >= p_max then
    next_lock := greatest(60, p_lock_secs);
    if p_double then
      next_lock := least(900, greatest(r.lock_seconds, next_lock));
    end if;
    update rate_limits
      set locked_until = now() + make_interval(secs => next_lock),
          lock_seconds = case when p_double then least(900, next_lock * 2) else r.lock_seconds end,
          hits = 0,
          window_start = now()
    where key = p_key;
    return _err('RATE_LIMITED', jsonb_build_object('seconds_left', next_lock));
  end if;

  return null;
end $$;

create or replace function _rate_clear(p_key text) returns void
language sql as $$
  update rate_limits set hits = 0, locked_until = null, window_start = now() where key = p_key;
$$;

-- ---------------------------------------------------------------------------
-- Role tokens with PINs
-- ---------------------------------------------------------------------------

create or replace function _make_role_tokens(p_game_id uuid, p_include_mc boolean) returns void
language plpgsql as $$
begin
  if p_include_mc then
    insert into role_tokens (token, game_id, role, pin)
    values (_new_token(), p_game_id, 'mc', _new_mc_pin(p_game_id));
  end if;
  insert into role_tokens (token, game_id, role, team_id, pin)
    select _new_token(), p_game_id, 'team', t.id, _new_digit_pin(p_game_id)
    from teams t where t.game_id = p_game_id;
  insert into role_tokens (token, game_id, role, post_id, pin)
    select _new_token(), p_game_id, 'post', p.id, _new_digit_pin(p_game_id)
    from posts p where p.game_id = p_game_id;
end $$;

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
  insert into games (code, config, name, host_tag, expires_at)
  values (gcode, coalesce(p_config, default_config()), gname, p_host_tag, now() + interval '7 days')
  returning id into gid;
  update requests set game_id = gid where action_id = p_action_id;

  insert into teams (game_id, slot, name, color) values
    (gid, 1, 'Bears',     'red'),
    (gid, 2, 'Magpies',   'blue'),
    (gid, 3, 'Pangolins', 'amber'),
    (gid, 4, 'Macaques',  'green'),
    (gid, 5, 'Pheasants', 'purple');

  insert into posts (game_id, kind, name) values
    (gid, 'shipwright',   'Shipwright'),
    (gid, 'sailmaker',    'Sailmaker'),
    (gid, 'cartographer', 'Cartographer'),
    (gid, 'inn',          'Harbor Inn'),
    (gid, 'blacksmith',   'Blacksmith');

  perform _init_play_state(gid);
  perform _make_role_tokens(gid, true);

  select token, pin into mc_tok, mc_pin from role_tokens where game_id = gid and role = 'mc';
  r := _ok(jsonb_build_object(
    'game_id', gid, 'code', gcode, 'name', gname,
    'mc_token', mc_tok, 'mc_pin', mc_pin
  ));
  return _with_now(_finish(p_action_id, r));
end $$;

-- Wipe play. New tokens also get new PINs. MC token and PIN stay.
create or replace function reset_game(p_action_id uuid, p_game_id uuid, p_new_tokens boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r jsonb;
begin
  r := _begin_request(p_action_id, p_game_id, 'reset_game');
  if r is not null then return _with_now(r); end if;

  perform 1 from games where id = p_game_id for update;
  perform 1 from teams where game_id = p_game_id order by id for update;

  delete from raids where game_id = p_game_id;
  delete from actions where game_id = p_game_id;
  delete from world_events where game_id = p_game_id;
  delete from requests where game_id = p_game_id and action_id <> p_action_id;

  update games set
    status = 'setup', paused_at = null, paused_ms_total = 0, started_at = null, ended_at = null,
    price_dial_percent = null, reveal_step = null, final_scores = null, show_scores_on_tv = false
  where id = p_game_id;

  perform _init_play_state(p_game_id);

  if p_new_tokens then
    delete from role_tokens where game_id = p_game_id and role <> 'mc';
    perform _make_role_tokens(p_game_id, false);
  end if;

  return _with_now(_finish(p_action_id, _ok()));
end $$;

create or replace function touch_role(p_token text, p_device_id text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  rt role_tokens;
  g games;
  other_active boolean;
  pruned jsonb;
begin
  select * into rt from role_tokens where token = p_token;
  if not found then return _with_now(_err('BAD_TOKEN')); end if;
  select * into g from games where id = rt.game_id;

  select exists (
    select 1 from jsonb_each_text(rt.devices) d
    where d.key <> p_device_id and d.value::timestamptz > now() - interval '90 seconds'
  ) into other_active;

  select coalesce(jsonb_object_agg(d.key, d.value), '{}'::jsonb) into pruned
  from jsonb_each(rt.devices) d
  where (d.value #>> '{}')::timestamptz > now() - interval '1 hour';

  update role_tokens
  set devices = pruned || jsonb_build_object(p_device_id, now()), last_seen_at = now()
  where token = p_token;

  return _with_now(_ok(jsonb_build_object(
    'role', rt.role, 'game_id', rt.game_id, 'game_code', g.code, 'game_name', g.name,
    'team_id', rt.team_id, 'post_id', rt.post_id,
    'other_device_active', other_active
  )));
end $$;

-- ---------------------------------------------------------------------------
-- Lookup / join / rotate
-- ---------------------------------------------------------------------------

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
    from teams t where t.game_id = g.id
    union all
    select 100 + row_number() over (order by p.kind), jsonb_build_object(
      'role', 'post', 'kind', p.kind, 'name', p.name
    ) as x
    from posts p where p.game_id = g.id
  ) q;

  return _with_now(_ok(jsonb_build_object(
    'code', g.code, 'name', g.name, 'status', g.status, 'roles', roles
  )));
end $$;

create or replace function _rate_locked(p_key text) returns jsonb
language plpgsql as $$
declare left_secs int;
begin
  select ceil(extract(epoch from locked_until - now()))::int into left_secs
  from rate_limits where key = p_key and locked_until > now();
  if left_secs is not null then
    return _err('RATE_LIMITED', jsonb_build_object('seconds_left', left_secs));
  end if;
  return null;
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

-- New token and PIN for one role. Old token stops working at once.
create or replace function rotate_role(
  p_action_id uuid, p_game_id uuid, p_role_id uuid
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  rt role_tokens;
  new_tok text;
  new_pin text;
begin
  r := _begin_request(p_action_id, p_game_id, 'rotate_role');
  if r is not null then return _with_now(r); end if;

  perform 1 from games where id = p_game_id for update;
  select * into rt from role_tokens where id = p_role_id and game_id = p_game_id for update;
  if rt.token is null then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  new_tok := _new_token();
  if rt.role = 'mc' then
    new_pin := _new_mc_pin(p_game_id);
  else
    new_pin := _new_digit_pin(p_game_id);
  end if;

  -- Avoid unique-pin clash with the current row while updating.
  update role_tokens set pin = '______' || substr(rt.id::text, 1, 8) where id = rt.id;
  update role_tokens
    set token = new_tok, pin = new_pin, devices = '{}'::jsonb, last_seen_at = null
  where id = rt.id;

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object(
    'role_id', rt.id, 'role', rt.role, 'token', new_tok, 'pin', new_pin,
    'team_id', rt.team_id, 'post_id', rt.post_id
  ))));
end $$;

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

create or replace function cleanup_old_games() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  games_deleted int;
  rates_deleted int;
  reqs_deleted int;
begin
  with doomed as (
    delete from games
    where created_at < now() - interval '7 days'
       or (ended_at is not null and ended_at < now() - interval '2 days')
    returning id
  )
  select count(*) into games_deleted from doomed;

  delete from rate_limits
  where window_start < now() - interval '1 day'
    and (locked_until is null or locked_until < now() - interval '1 day');
  get diagnostics rates_deleted = row_count;

  delete from requests where created_at < now() - interval '2 days';
  get diagnostics reqs_deleted = row_count;

  return jsonb_build_object(
    'games', games_deleted, 'rate_limits', rates_deleted, 'requests', reqs_deleted
  );
end $$;

-- Hourly job. Ignore if cron is unavailable on a stripped image.
do $outer$
begin
  perform cron.unschedule('voyage_cleanup_old_games');
exception when others then
  null;
end $outer$;

do $outer$
begin
  perform cron.schedule('voyage_cleanup_old_games', '0 * * * *', 'select cleanup_old_games()');
exception when others then
  raise notice 'pg_cron schedule skipped: %', sqlerrm;
end $outer$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function current_prices(uuid) to anon, authenticated;
grant execute on function game_scores(uuid) to anon, authenticated;
