-- Setup: create game, edit names/config, reset, role lookup.

create or replace function _with_now(p_result jsonb) returns jsonb
language sql volatile as $$ select p_result || jsonb_build_object('server_now', _now_ms()) $$;

create or replace function _make_role_tokens(p_game_id uuid, p_include_mc boolean) returns void
language plpgsql as $$
begin
  if p_include_mc then
    insert into role_tokens (token, game_id, role) values (_new_token(), p_game_id, 'mc');
  end if;
  insert into role_tokens (token, game_id, role, team_id)
    select _new_token(), p_game_id, 'team', id from teams where game_id = p_game_id;
  insert into role_tokens (token, game_id, role, post_id)
    select _new_token(), p_game_id, 'post', id from posts where game_id = p_game_id;
end $$;

create or replace function create_game(p_action_id uuid, p_config jsonb default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  gid uuid;
  gcode text;
  mc_tok text;
begin
  r := _begin_request(p_action_id, null, 'create_game');
  if r is not null then return _with_now(r); end if;

  gcode := _new_game_code();
  insert into games (code, config) values (gcode, coalesce(p_config, default_config()))
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

  select token into mc_tok from role_tokens where game_id = gid and role = 'mc';
  r := _ok(jsonb_build_object('game_id', gid, 'code', gcode, 'mc_token', mc_tok));
  return _with_now(_finish(p_action_id, r));
end $$;

-- p_teams: [{id, name, color}], p_posts: [{id, name, staff_name}]. Config only while in setup.
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
    update teams set name = e->>'name', color = e->>'color'
    where id = (e->>'id')::uuid and game_id = p_game_id;
  end loop;

  for e in select * from jsonb_array_elements(coalesce(p_posts, '[]'::jsonb)) loop
    update posts set name = e->>'name', staff_name = nullif(e->>'staff_name', ''), updated_at = now()
    where id = (e->>'id')::uuid and game_id = p_game_id;
  end loop;

  return _with_now(_finish(p_action_id, _ok()));
end $$;

-- Wipe all play and go back to setup. Keeps the QR codes unless p_new_tokens.
-- The MC token is always kept so the MC stays logged in.
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

-- Called when a phone opens a role page. Tells it who it is and if the role is open elsewhere.
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
    'role', rt.role, 'game_id', rt.game_id, 'game_code', g.code,
    'team_id', rt.team_id, 'post_id', rt.post_id,
    'other_device_active', other_active
  )));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
