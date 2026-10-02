-- Two actions on the same game could deadlock. Inserting the request takes a shared
-- lock on the game (it is a foreign key), and the action then waits for an exclusive
-- lock. The other action does the same, and each waits for the other.
-- Take the exclusive lock first, so actions on one game simply line up.

create or replace function _begin_request(p_action_id uuid, p_game_id uuid, p_type text) returns jsonb
language plpgsql as $$
declare r jsonb;
begin
  if p_game_id is not null then
    perform 1 from games where id = p_game_id for update;
  end if;
  insert into requests (action_id, game_id, type) values (p_action_id, p_game_id, p_type)
  on conflict (action_id) do nothing;
  if found then return null; end if;
  select result into r from requests where action_id = p_action_id;
  return coalesce(r, _err('IN_PROGRESS'));
end $$;
