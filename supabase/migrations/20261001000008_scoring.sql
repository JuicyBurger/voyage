-- Scoring and the final reveal. One formula for the MC panel, the TV and the reveal.

-- Scores for every team, best first. Tie-break: more gold, then the earlier boat.
-- Safe for anon: it only reads public team data.
create or replace function game_scores(p_game_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
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
  select coalesce(jsonb_agg(to_jsonb(r) order by r.place), '[]'::jsonb)
  from (
    select totals.*,
      row_number() over (order by total desc, gold desc, boat_done_at asc nulls last, slot) as place
    from totals
  ) r
$$;

-- The reveal walks from last place to first, one tap at a time.
-- 'start' freezes the scores; after that the MC can no longer adjust.
create or replace function reveal(p_action_id uuid, p_game_id uuid, p_step text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  n int;
begin
  r := _begin_request(p_action_id, p_game_id, 'reveal');
  if r is not null then return _with_now(r); end if;
  select * into g from games where id = p_game_id for update;

  if p_step = 'start' then
    if g.status <> 'ended' then
      return _with_now(_finish(p_action_id, _err('NOT_ENDED')));
    end if;
    if g.reveal_step is null then
      update games set final_scores = game_scores(g.id), reveal_step = 0 where id = g.id;
    end if;
  elsif p_step in ('next', 'back') then
    if g.reveal_step is null then
      return _with_now(_finish(p_action_id, _err('BAD_STATE', jsonb_build_object('status', g.status))));
    end if;
    n := jsonb_array_length(g.final_scores);
    update games set reveal_step = case when p_step = 'next' then least(reveal_step + 1, n)
                                        else greatest(reveal_step - 1, 0) end
    where id = g.id;
  else
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  return _with_now(_finish(p_action_id, _ok()));
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function current_prices(uuid) to anon, authenticated;
grant execute on function game_scores(uuid) to anon, authenticated;
