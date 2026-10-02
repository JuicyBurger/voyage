export type Role = "mc" | "team" | "post";
export type GameStatus = "setup" | "ready" | "running" | "last_call" | "ended";
export type PostKind = "shipwright" | "sailmaker" | "cartographer" | "inn" | "blacksmith";
export type Part = "hull" | "mast" | "sail" | "map";
export type Item = Part | "flag" | "sword" | "shield";

export const POST_KINDS: PostKind[] = ["shipwright", "sailmaker", "cartographer", "inn", "blacksmith"];
export const PARTS: Part[] = ["hull", "mast", "sail", "map"];

export type GameConfig = {
  start_gold: number;
  parts: Record<Part, { price: number; post: PostKind }>;
  stock_start: number;
  supply_ship_add: number;
  job_pay: Record<PostKind, number>;
  fail_pay: number;
  jobs_per_post: number;
  items: {
    flag: { price: number; raids: number };
    sword: { price: number; bonus: number };
    shield: { price: number };
  };
  raid: { steal: number; immune_minutes: number; max_times_raided: number };
  events: {
    gold_rush_bonus: number;
    gold_rush_minutes: number;
    storm_minutes: number;
    market_sale_discount: number;
    market_sale_minutes: number;
    pirate_hour_multiplier: number;
    pirate_hour_minutes: number;
    bounty_bonus: number;
    bounty_minutes: number;
    lighthouse_aid: number;
    price_dial_percent: number;
  };
  scoring: {
    per_part: number;
    boat_bonus: number;
    finish_order: number[];
    gold_per_point: number;
    per_raid_win: number;
    most_raids_bonus: number;
    most_raids_min: number;
  };
  clock: { play_start_minute: number; last_call_minute: number; end_minute: number };
  schedule: { minute: number; kind: string }[];
  pace_check: Record<string, { normal: number; slow_at_or_below: number; fast_at_or_above: number }>;
  post_rules: Record<PostKind, string>;
  test_force_roll?: { attacker: number; defender: number };
};

export type Game = {
  id: string;
  code: string;
  name: string;
  host_tag: string | null;
  expires_at: string;
  status: GameStatus;
  paused_at: string | null;
  paused_ms_total: number;
  started_at: string | null;
  ended_at: string | null;
  config: GameConfig;
  speed: number;
  rehearsal: boolean;
  price_dial_percent: number | null;
  auto_fire: boolean;
  show_scores_on_tv: boolean;
  reveal_step: number | null;
  final_scores: unknown;
  created_at: string;
};

export type Team = {
  id: string;
  game_id: string;
  slot: number;
  name: string;
  color: string;
  gold: number;
  has_hull: boolean;
  has_mast: boolean;
  has_sail: boolean;
  has_map: boolean;
  has_flag: boolean;
  raids_left: number;
  has_sword: boolean;
  shield_count: number;
  double_armed: boolean;
  double_used: boolean;
  raid_wins: number;
  times_raided: number;
  immune_until: string | null;
  boat_done_at: string | null;
  boat_rank: number | null;
};

export type Post = {
  id: string;
  game_id: string;
  kind: PostKind;
  name: string;
  staff_name: string | null;
  serving_team_id: string | null;
  waiting_count: number;
  updated_at: string;
};

export type JobCount = { team_id: string; post_id: string; count: number };

export type WorldEvent = {
  id: string;
  game_id: string;
  kind: string;
  payload: Record<string, unknown>;
  schedule_index: number | null;
  starts_at: string;
  ends_at: string | null;
  cancelled_at: string | null;
  created_at: string;
};

export type Action = {
  id: string;
  game_id: string;
  actor_role: Role;
  actor_post_id: string | null;
  actor_team_id: string | null;
  team_id: string | null;
  kind: string;
  amount: number;
  item: string | null;
  details: Record<string, unknown> & { minute_ms?: number };
  undone_at: string | null;
  undo_of: string | null;
  created_at: string;
};

export type RaidResult = "win" | "loss" | "blocked";

export type Raid = {
  id: string;
  game_id: string;
  attacker_id: string;
  defender_id: string;
  attacker_die: number | null;
  attacker_bonus: number;
  defender_die: number | null;
  defender_bonus: number;
  result: RaidResult;
  amount: number;
  created_at: string;
};

export type Score = {
  team_id: string;
  name: string;
  color: string;
  gold: number;
  parts: number;
  raid_wins: number;
  boat_rank: number | null;
  parts_points: number;
  boat_points: number;
  finish_points: number;
  gold_points: number;
  raid_points: number;
  most_raids_points: number;
  total: number;
  place: number;
};

export type Prices = Record<Item, number>;

export type ApiResult<S = Record<string, unknown>> = {
  ok: boolean;
  error_code?: string;
  args?: Record<string, unknown>;
  message?: string;
  state?: S;
  server_now: number;
};

export type Identity = {
  role: Role;
  game_id: string;
  game_code: string;
  game_name?: string;
  team_id: string | null;
  post_id: string | null;
  other_device_active: boolean;
};
