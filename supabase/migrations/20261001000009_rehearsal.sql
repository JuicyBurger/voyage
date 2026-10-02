-- Rehearsal: the clock runs 4× faster. Only before the game starts.
-- Event lengths and raid immunity follow the fast clock.
-- The undo window and the wrong-code block stay in real time (they use fixed intervals).

create or replace function set_option(p_action_id uuid, p_game_id uuid, p_name text, p_on boolean)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_option');
  if r is not null then return _with_now(r); end if;

  if p_name = 'rehearsal' then
    select * into g from games where id = p_game_id for update;
    if g.status not in ('setup', 'ready') then
      return _with_now(_finish(p_action_id, _err('REHEARSAL_LOCKED')));
    end if;
    update games set rehearsal = p_on, speed = case when p_on then 4 else 1 end where id = g.id;
  elsif p_name = 'auto_fire' then
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
grant execute on function game_scores(uuid) to anon, authenticated;
