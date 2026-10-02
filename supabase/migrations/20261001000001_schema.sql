-- Voyage Companion: tables

create extension if not exists pgcrypto;

create table games (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique check (code ~ '^[A-Z]{6}$'),
  status              text not null default 'setup'
                      check (status in ('setup','ready','running','last_call','ended')),
  paused_at           timestamptz,                 -- not null = paused
  paused_ms_total     bigint not null default 0,
  started_at          timestamptz,
  ended_at            timestamptz,
  config              jsonb not null,
  speed               numeric not null default 1,  -- 4 in rehearsal
  rehearsal           boolean not null default false,
  price_dial_percent  int,                         -- null = off, e.g. -20 or 20
  auto_fire           boolean not null default false,
  show_scores_on_tv   boolean not null default false,
  reveal_step         int,                         -- null = reveal not started
  final_scores        jsonb,
  created_at          timestamptz not null default now()
);

create table teams (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  slot          int  not null check (slot between 1 and 5),
  name          text not null,
  color         text not null,
  gold          int  not null default 0 check (gold >= 0),
  has_hull      boolean not null default false,
  has_mast      boolean not null default false,
  has_sail      boolean not null default false,
  has_map       boolean not null default false,
  has_flag      boolean not null default false,
  raids_left    int not null default 0 check (raids_left >= 0),
  has_sword     boolean not null default false,
  shield_count  int not null default 0 check (shield_count between 0 and 1),
  double_armed  boolean not null default false,
  double_used   boolean not null default false,
  raid_wins     int not null default 0,
  times_raided  int not null default 0,
  immune_until  timestamptz,
  boat_done_at  timestamptz,
  boat_rank     int,
  unique (game_id, slot)
);
create index teams_game_idx on teams (game_id);

create table team_secrets (
  team_id            uuid primary key references teams(id) on delete cascade,
  game_id            uuid not null references games(id) on delete cascade,
  raid_code          text not null check (raid_code ~ '^\d{4}$'),
  wrong_codes        int not null default 0,
  raid_blocked_until timestamptz
);
create index team_secrets_game_idx on team_secrets (game_id);

create table posts (
  id              uuid primary key default gen_random_uuid(),
  game_id         uuid not null references games(id) on delete cascade,
  kind            text not null check (kind in ('shipwright','sailmaker','cartographer','inn','blacksmith')),
  name            text not null,
  staff_name      text,
  serving_team_id uuid references teams(id) on delete set null,
  waiting_count   int not null default 0 check (waiting_count >= 0),
  updated_at      timestamptz not null default now(),
  unique (game_id, kind)
);
create index posts_game_idx on posts (game_id);

create table role_tokens (
  token        text primary key,
  game_id      uuid not null references games(id) on delete cascade,
  role         text not null check (role in ('mc','team','post')),
  team_id      uuid references teams(id) on delete cascade,
  post_id      uuid references posts(id) on delete cascade,
  devices      jsonb not null default '{}',
  last_seen_at timestamptz,
  created_at   timestamptz not null default now(),
  check ((role = 'team') = (team_id is not null)),
  check ((role = 'post') = (post_id is not null))
);
create index role_tokens_game_idx on role_tokens (game_id);

create table stock (
  game_id uuid not null references games(id) on delete cascade,
  part    text not null check (part in ('hull','mast','sail','map')),
  qty     int  not null check (qty >= 0),
  primary key (game_id, part)
);

create table job_counts (
  game_id uuid not null references games(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  post_id uuid not null references posts(id) on delete cascade,
  count   int  not null default 0,
  primary key (team_id, post_id)
);
create index job_counts_game_idx on job_counts (game_id);

create table world_events (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games(id) on delete cascade,
  kind           text not null,
  payload        jsonb not null default '{}',
  schedule_index int,
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now()
);
create index world_events_game_idx on world_events (game_id, created_at desc);

create table requests (
  action_id  uuid primary key,
  game_id    uuid references games(id) on delete cascade,
  type       text not null,
  result     jsonb,
  created_at timestamptz not null default now()
);
create index requests_game_idx on requests (game_id);

create table actions (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  request_id    uuid references requests(action_id) on delete set null,
  actor_role    text not null,
  actor_post_id uuid references posts(id) on delete set null,
  actor_team_id uuid references teams(id) on delete set null,
  team_id       uuid references teams(id) on delete cascade,
  kind          text not null,
  amount        int not null default 0,
  item          text,
  details       jsonb not null default '{}',
  undone_at     timestamptz,
  undo_of       uuid references actions(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index actions_game_idx on actions (game_id, created_at desc);
create index actions_team_idx on actions (team_id, created_at desc);
create index actions_post_idx on actions (actor_post_id, created_at desc);

create table raids (
  id             uuid primary key default gen_random_uuid(),
  game_id        uuid not null references games(id) on delete cascade,
  request_id     uuid references requests(action_id) on delete set null,
  attacker_id    uuid not null references teams(id) on delete cascade,
  defender_id    uuid not null references teams(id) on delete cascade,
  attacker_die   int,
  attacker_bonus int not null default 0,
  defender_die   int,
  defender_bonus int not null default 0,
  result         text not null check (result in ('win','loss','blocked')),
  amount         int not null default 0,
  created_at     timestamptz not null default now()
);
create index raids_game_idx on raids (game_id, created_at desc);
