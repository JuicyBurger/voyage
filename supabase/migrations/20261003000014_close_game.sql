-- Close out a finished game: wipe the row (cascade) so every device's token dies.

create or replace function close_game(p_action_id uuid, p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  out jsonb;
begin
  r := _begin_request(p_action_id, p_game_id, 'close_game');
  if r is not null then return _with_now(r); end if;

  out := _ok();
  perform _finish(p_action_id, out);

  -- Cascades role_tokens, teams, posts, actions, etc. Old tokens then return BAD_TOKEN.
  delete from games where id = p_game_id;

  return _with_now(out);
end $$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function _pass_game_id() to authenticated;
grant execute on function current_prices(uuid) to authenticated;
grant execute on function game_scores(uuid) to authenticated;
