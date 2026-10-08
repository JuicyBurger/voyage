-- Playtest revisions: job timer config, raid lock + unlock OTP,
-- Indonesian default post rules/names, Trivia replaces Sailmaker label.

alter table teams
  add column if not exists raid_locked_by uuid references teams(id),
  add column if not exists raid_unlock_code text;

create or replace function default_config() returns jsonb
language sql immutable as $$
select '{
  "start_gold": 30,
  "parts": {
    "hull": { "price": 55, "post": "shipwright" },
    "mast": { "price": 35, "post": "shipwright" },
    "sail": { "price": 45, "post": "sailmaker" },
    "map":  { "price": 35, "post": "cartographer" }
  },
  "stock_start": 3,
  "supply_ship_add": 2,
  "job_pay": { "shipwright": 12, "sailmaker": 12, "cartographer": 12, "inn": 10, "blacksmith": 10 },
  "fail_pay": 4,
  "jobs_per_post": 6,
  "job_timer_seconds": 45,
  "items": {
    "flag":   { "price": 15, "raids": 3 },
    "sword":  { "price": 15, "bonus": 1 },
    "shield": { "price": 15 }
  },
  "raid": { "steal": 15, "immune_minutes": 3, "max_times_raided": 3 },
  "events": {
    "gold_rush_bonus": 5, "gold_rush_minutes": 2,
    "storm_minutes": 1,
    "market_sale_discount": 10, "market_sale_minutes": 2,
    "pirate_hour_multiplier": 2, "pirate_hour_minutes": 3,
    "bounty_bonus": 10, "bounty_minutes": 3,
    "lighthouse_aid": 15,
    "price_dial_percent": 20
  },
  "scoring": {
    "per_part": 15, "boat_bonus": 40, "finish_order": [15, 10, 5],
    "gold_per_point": 5, "per_raid_win": 5,
    "most_raids_bonus": 10, "most_raids_min": 2
  },
  "clock": { "play_start_minute": 5, "last_call_minute": 40, "end_minute": 45 },
  "schedule": [
    { "minute": 13, "kind": "gold_rush" },
    { "minute": 19, "kind": "storm" },
    { "minute": 23, "kind": "supply_ship" },
    { "minute": 25, "kind": "lighthouse_aid" },
    { "minute": 27, "kind": "market_sale" },
    { "minute": 29, "kind": "pirate_hour" },
    { "minute": 34, "kind": "bounty" },
    { "minute": 35, "kind": "gold_rush" },
    { "minute": 40, "kind": "last_call" }
  ],
  "pace_check": {
    "20": { "normal": 9,  "slow_at_or_below": 7,  "fast_at_or_above": 12 },
    "25": { "normal": 11, "slow_at_or_below": 10, "fast_at_or_above": 14 }
  },
  "post_rules": {
    "shipwright":   "Perahu Manusia (20 dtk): tim berdiri satu baris dan mendayung bersama. Lulus jika semua tetap sebaris dan mendayung sampai waktu habis. Variasi: diam, hitung 1-2-3 Mandarin, ikuti tepukan, bernyanyi, mata tertutup, jongkok.",
    "sailmaker":    "Trivia Alkitab: ambil 1 pertanyaan dari daftar 20 soal. Tim menjawab. Lulus jika jawaban benar. Variasi: tanpa petunjuk, batasi waktu, atau giliran satu orang menjawab.",
    "cartographer": "Kartu Landmark: tunjukkan 1 kartu landmark Taiwan acak. Tim punya 3 kesempatan menebak namanya. Beri petunjuk kecil. Lulus jika benar dalam 3 kali. Selalu sebutkan jawaban di akhir, lalu acak lagi kartunya.",
    "inn":          "Bajak Laut Diam (45 dtk): satu pemain memperagakan kata rahasia tanpa suara, tanpa menggerakkan mulut, dan tanpa menunjuk. Ganti pemain tiap ronde. Lulus jika tim menebak dalam 45 detik. Daftar kata ada di lembar pos.",
    "blacksmith":   "Hitung Bersama (45 dtk): lingkaran, mata tertutup. Hitung angka ronde, satu suara per angka, urutan bebas. Tidak boleh dua angka berurutan dari orang yang sama, semua harus bicara minimal sekali. Dua suara bersamaan: mulai lagi. Lulus jika selesai sebelum waktu habis."
  }
}'::jsonb
$$;

-- New unlock code, unique among unlock codes in this game.
create or replace function _new_unlock_code(p_game_id uuid) returns text
language plpgsql volatile as $$
declare c text;
begin
  loop
    c := lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (
      select 1 from teams where game_id = p_game_id and raid_unlock_code = c
    );
  end loop;
  return c;
end $$;

create or replace function _init_play_state(p_game_id uuid) returns void
language plpgsql as $$
declare
  cfg jsonb;
  t record;
begin
  select config into cfg from games where id = p_game_id;

  update teams set
    gold = (cfg->>'start_gold')::int,
    has_hull = false, has_mast = false, has_sail = false, has_map = false,
    has_flag = false, raids_left = 0, has_sword = false, shield_count = 0,
    double_armed = false, double_used = false, raid_wins = 0, times_raided = 0,
    immune_until = null, raid_locked_by = null, raid_unlock_code = null,
    boat_done_at = null, boat_rank = null
  where game_id = p_game_id;

  delete from stock where game_id = p_game_id;
  insert into stock (game_id, part, qty)
    select p_game_id, p, (cfg->>'stock_start')::int from unnest(array['hull','mast','sail','map']) p;

  delete from job_counts where game_id = p_game_id;
  insert into job_counts (game_id, team_id, post_id, count)
    select p_game_id, t2.id, p.id, 0
    from teams t2 cross join posts p
    where t2.game_id = p_game_id and p.game_id = p_game_id;

  update posts set serving_team_id = null, waiting_count = 0, updated_at = now()
  where game_id = p_game_id;

  delete from team_secrets where game_id = p_game_id;
  for t in select id from teams where game_id = p_game_id order by slot loop
    insert into team_secrets (team_id, game_id, raid_code)
    values (t.id, p_game_id, _new_raid_code(p_game_id));
  end loop;
end $$;

------------------------------------------------------------------------------
-- start_raid: on win, lock the defender with an unlock OTP
------------------------------------------------------------------------------
create or replace function start_raid(
  p_action_id uuid, p_game_id uuid, p_attacker_id uuid, p_defender_id uuid, p_code text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  att teams;
  def teams;
  att_secret team_secrets;
  def_secret team_secrets;
  max_tries constant int := 3;
  v_result text;
  att_die int;
  def_die int;
  att_bonus int := 0;
  def_bonus int := 0;
  v_amount int := 0;
  doubled boolean := false;
  pirate_hour boolean := false;
  bounty boolean := false;
  bounty_ev world_events;
  raid_id uuid;
  unlock_code text;
begin
  r := _begin_request(p_action_id, p_game_id, 'start_raid');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;

  if p_attacker_id = p_defender_id then
    return _with_now(_finish(p_action_id, _err('OWN_TEAM')));
  end if;

  perform 1 from teams where id in (p_attacker_id, p_defender_id) and game_id = g.id order by id for update;
  select * into att from teams where id = p_attacker_id and game_id = g.id;
  select * into def from teams where id = p_defender_id and game_id = g.id;
  if att.id is null or def.id is null then
    return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
  end if;

  r := _check_can_act(g, 'raid');
  if r is not null then return _with_now(_finish(p_action_id, r)); end if;

  if not att.has_flag or att.raids_left <= 0 then
    return _with_now(_finish(p_action_id, _err('NO_RAIDS')));
  end if;

  select * into att_secret from team_secrets where team_id = att.id for update;
  select * into def_secret from team_secrets where team_id = def.id for update;

  if att_secret.raid_blocked_until > now() then
    return _with_now(_finish(p_action_id, _err('RAID_BLOCKED',
      jsonb_build_object('seconds_left', ceil(extract(epoch from att_secret.raid_blocked_until - now()))))));
  end if;

  if p_code is distinct from def_secret.raid_code then
    if att_secret.wrong_codes + 1 >= max_tries then
      update team_secrets set wrong_codes = 0, raid_blocked_until = now() + interval '30 seconds'
        where team_id = att.id;
      return _with_now(_finish(p_action_id, _err('RAID_BLOCKED', jsonb_build_object('seconds_left', 30))));
    end if;
    update team_secrets set wrong_codes = wrong_codes + 1 where team_id = att.id;
    return _with_now(_finish(p_action_id, _err('WRONG_CODE',
      jsonb_build_object('tries_left', max_tries - att_secret.wrong_codes - 1))));
  end if;
  update team_secrets set wrong_codes = 0 where team_id = att.id;

  if def.immune_until > now() then
    return _with_now(_finish(p_action_id, _err('DEFENDER_SAFE', jsonb_build_object(
      'team', def.name, 'seconds_left', ceil(extract(epoch from def.immune_until - now()))))));
  end if;
  if def.times_raided >= (g.config->'raid'->>'max_times_raided')::int then
    return _with_now(_finish(p_action_id, _err('MAX_RAIDED', jsonb_build_object('team', def.name))));
  end if;
  if def.gold <= 0 then
    return _with_now(_finish(p_action_id, _err('NOTHING_TO_STEAL', jsonb_build_object('team', def.name))));
  end if;
  if def.raid_locked_by is not null then
    return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', def.name))));
  end if;

  if def.shield_count > 0 then
    v_result := 'blocked';
    update teams set shield_count = 0 where id = def.id;
  else
    att_die := _roll(g, 'attacker');
    def_die := _roll(g, 'defender');
    if att.has_sword then att_bonus := (g.config->'items'->'sword'->>'bonus')::int; end if;
    if def.has_sword then def_bonus := (g.config->'items'->'sword'->>'bonus')::int; end if;
    v_result := case when att_die + att_bonus > def_die + def_bonus then 'win' else 'loss' end;
  end if;

  if v_result = 'win' then
    v_amount := (g.config->'raid'->>'steal')::int;
    if (_active_event(g.id, 'pirate_hour')).id is not null then
      pirate_hour := true;
      v_amount := v_amount * (g.config->'events'->>'pirate_hour_multiplier')::int;
    end if;
    bounty_ev := _active_event(g.id, 'bounty');
    if bounty_ev.id is not null and (bounty_ev.payload->'team_ids') ? def.id::text then
      bounty := true;
      v_amount := v_amount + (g.config->'events'->>'bounty_bonus')::int;
    end if;
    if att.double_armed then
      doubled := true;
      v_amount := v_amount * 2;
    end if;
    v_amount := least(v_amount, def.gold);

    update teams set
      gold = gold + v_amount,
      raid_wins = raid_wins + 1,
      double_armed = case when doubled then false else double_armed end,
      double_used  = case when doubled then true  else double_used  end
    where id = att.id;
    update teams set gold = gold - v_amount where id = def.id;

    unlock_code := _new_unlock_code(g.id);
    update teams set
      raid_locked_by = att.id,
      raid_unlock_code = unlock_code
    where id = def.id;
    -- Drop them from any post line while locked.
    update posts set serving_team_id = null, updated_at = now()
      where game_id = g.id and serving_team_id = def.id;
  end if;

  update teams set raids_left = raids_left - 1 where id = att.id;
  update teams set
    times_raided = times_raided + 1,
    immune_until = now() + _real_interval(g, (g.config->'raid'->>'immune_minutes')::numeric)
  where id = def.id;
  update team_secrets set raid_code = _new_raid_code(g.id) where team_id = def.id;

  insert into raids (game_id, request_id, attacker_id, defender_id,
                     attacker_die, attacker_bonus, defender_die, defender_bonus, result, amount)
  values (g.id, p_action_id, att.id, def.id, att_die, att_bonus, def_die, def_bonus, v_result, v_amount)
  returning id into raid_id;

  perform _log(g, p_action_id, 'team', null, att.id, att.id, 'raid', v_amount, null,
               jsonb_build_object('raid_id', raid_id, 'result', v_result, 'other', def.name,
                                  'doubled', doubled, 'pirate_hour', pirate_hour, 'bounty', bounty));
  perform _log(g, p_action_id, 'team', null, att.id, def.id, 'raided', -v_amount, null,
               jsonb_build_object('raid_id', raid_id, 'result', v_result, 'other', att.name));

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object(
    'raid_id', raid_id, 'result', v_result, 'defender', def.name, 'amount', v_amount,
    'attacker_die', att_die, 'attacker_bonus', att_bonus,
    'defender_die', def_die, 'defender_bonus', def_bonus,
    'doubled', doubled, 'pirate_hour', pirate_hour, 'bounty', bounty,
    'raids_left', att.raids_left - 1,
    'unlock_code', unlock_code))));
end $$;

------------------------------------------------------------------------------
-- unlock_raid_victim: attacker types the OTP shown on the locked team phone
------------------------------------------------------------------------------
create or replace function unlock_raid_victim(
  p_action_id uuid, p_game_id uuid, p_attacker_id uuid, p_code text
) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  g games;
  def teams;
begin
  r := _begin_request(p_action_id, p_game_id, 'unlock_raid_victim');
  if r is not null then return _with_now(r); end if;

  select * into g from games where id = p_game_id for update;
  if g.status = 'ended' then
    return _with_now(_finish(p_action_id, _err('GAME_OVER')));
  end if;

  select * into def from teams
  where game_id = g.id and raid_locked_by = p_attacker_id and raid_unlock_code = p_code
  for update;

  if def.id is null then
    return _with_now(_finish(p_action_id, _err('WRONG_UNLOCK_CODE')));
  end if;

  update teams set raid_locked_by = null, raid_unlock_code = null where id = def.id;

  perform _log(g, p_action_id, 'team', null, p_attacker_id, def.id, 'raid_unlock', 0, null,
               jsonb_build_object('team', def.name, 'other',
                 (select name from teams where id = p_attacker_id)));

  return _with_now(_finish(p_action_id, _ok(jsonb_build_object('team', def.name))));
end $$;

------------------------------------------------------------------------------
-- Gate post actions while a team is raid-locked
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

create or replace function set_serving(p_action_id uuid, p_game_id uuid, p_post_id uuid, p_team_id uuid)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb;
  t teams;
begin
  r := _begin_request(p_action_id, p_game_id, 'set_serving');
  if r is not null then return _with_now(r); end if;
  if p_team_id is not null then
    select * into t from teams where id = p_team_id and game_id = p_game_id;
    if t.id is null then
      return _with_now(_finish(p_action_id, _err('BAD_INPUT')));
    end if;
    if t.raid_locked_by is not null then
      return _with_now(_finish(p_action_id, _err('RAID_LOCKED', jsonb_build_object('team', t.name))));
    end if;
  end if;
  update posts set serving_team_id = p_team_id, updated_at = now()
  where id = p_post_id and game_id = p_game_id;
  return _with_now(_finish(p_action_id, _ok()));
end $$;

-- New games get Indonesian post display names (Trivia for sailmaker).
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

-- Unstarted games pick up timer, rules, and Trivia label.
update games
set config = config
  || jsonb_build_object(
       'job_timer_seconds', default_config()->'job_timer_seconds',
       'post_rules',        default_config()->'post_rules')
where status = 'setup';

update posts
set name = 'Trivia'
where kind = 'sailmaker'
  and game_id in (select id from games where status = 'setup')
  and name = 'Sailmaker';

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
grant execute on function _pass_game_id() to authenticated;
grant execute on function current_prices(uuid) to authenticated;
grant execute on function game_scores(uuid) to authenticated;
