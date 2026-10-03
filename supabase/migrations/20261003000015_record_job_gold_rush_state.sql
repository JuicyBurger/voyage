-- Return gold_rush in record_job state so the post toast can name the bonus.
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
    'team', t.name, 'amount', amount, 'doubled', doubled,
    'gold_rush', bonus > 0, 'gold', t.gold + amount))));
end $$;
