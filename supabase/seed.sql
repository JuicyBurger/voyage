-- Demo game with fixed tokens and PINs, for local testing only.
-- Open http://localhost:3001/join/demo-mc-000000000000000000000 to log in as the MC.
-- Or join with game code DEMOGM and MC PIN DEMYGAME.

select create_game(
  '00000000-0000-0000-0000-000000000001',
  null,
  'Demo game',
  'demohost'
);

update games set code = 'DEMOGM'
where id = (select game_id from requests where action_id = '00000000-0000-0000-0000-000000000001');

update role_tokens rt set token = 'demo-mc-000000000000000000000', pin = 'DEMYGAME'
from games g where g.id = rt.game_id and g.code = 'DEMOGM' and rt.role = 'mc';

update role_tokens rt set
  token = 'demo-team-' || t.slot || '-00000000000000000000',
  pin = lpad(t.slot::text, 6, '0')
from teams t, games g
where t.id = rt.team_id and g.id = t.game_id and g.code = 'DEMOGM';

update role_tokens rt set
  token = 'demo-post-' || p.kind || '-0000000000000000',
  pin = case p.kind
    when 'shipwright' then '666666'
    when 'sailmaker' then '777777'
    when 'cartographer' then '888888'
    when 'inn' then '999999'
    when 'blacksmith' then '000000'
  end
from posts p, games g
where p.id = rt.post_id and g.id = p.game_id and g.code = 'DEMOGM';
