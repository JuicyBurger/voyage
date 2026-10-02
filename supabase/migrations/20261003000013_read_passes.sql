-- Phase 3: per-game read passes. Phones get a short-lived JWT; RLS only returns that game.

create or replace function _pass_game_id() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'game_id', '')::uuid
$$;

grant execute on function _pass_game_id() to authenticated;

drop policy if exists "public read" on games;
drop policy if exists "public read" on teams;
drop policy if exists "public read" on posts;
drop policy if exists "public read" on stock;
drop policy if exists "public read" on job_counts;
drop policy if exists "public read" on world_events;
drop policy if exists "public read" on actions;
drop policy if exists "public read" on raids;

revoke select on all tables in schema public from anon;
revoke all on table team_secrets, role_tokens, requests, rate_limits from anon, authenticated;

grant select on table games, teams, posts, stock, job_counts, world_events, actions, raids to authenticated;

create policy "pass read" on games
  for select to authenticated
  using (id = _pass_game_id());

create policy "pass read" on teams
  for select to authenticated
  using (game_id = _pass_game_id());

create policy "pass read" on posts
  for select to authenticated
  using (game_id = _pass_game_id());

create policy "pass read" on stock
  for select to authenticated
  using (game_id = _pass_game_id());

create policy "pass read" on job_counts
  for select to authenticated
  using (game_id = _pass_game_id());

create policy "pass read" on world_events
  for select to authenticated
  using (game_id = _pass_game_id());

create policy "pass read" on actions
  for select to authenticated
  using (game_id = _pass_game_id());

create policy "pass read" on raids
  for select to authenticated
  using (game_id = _pass_game_id());

-- Enforce the pass when a browser calls these RPCs. Service-role (API writes) keeps working.
create or replace function current_prices(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare g games;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and p_game_id is distinct from _pass_game_id() then
    return null;
  end if;
  select * into g from games where id = p_game_id;
  if not found then return null; end if;
  return jsonb_build_object(
    'hull', _item_price(g, 'hull'), 'mast', _item_price(g, 'mast'),
    'sail', _item_price(g, 'sail'), 'map', _item_price(g, 'map'),
    'flag', _item_price(g, 'flag'), 'sword', _item_price(g, 'sword'), 'shield', _item_price(g, 'shield'));
end $$;

create or replace function game_scores(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if coalesce(auth.jwt() ->> 'role', '') = 'authenticated'
     and p_game_id is distinct from _pass_game_id() then
    return null;
  end if;

  with sc as (
    select config->'scoring' as s from games where id = p_game_id
  ),
  t as (
    select tm.*, (tm.has_hull::int + tm.has_mast::int + tm.has_sail::int + tm.has_map::int) as parts
    from teams tm where tm.game_id = p_game_id
  ),
  most as (
    select max(raid_wins) as m from t
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
  select coalesce(jsonb_agg(to_jsonb(r) order by r.place), '[]'::jsonb) into result
  from (
    select totals.*,
      row_number() over (order by total desc, gold desc, boat_done_at asc nulls last, slot) as place
    from totals
  ) r;

  return result;
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function _pass_game_id() to authenticated;
grant execute on function current_prices(uuid) to authenticated;
grant execute on function game_scores(uuid) to authenticated;
