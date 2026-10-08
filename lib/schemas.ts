import { z } from "zod";

const num = z.number().int().min(0).max(10000);
const postKind = z.enum(["shipwright", "sailmaker", "cartographer", "inn", "blacksmith"]);

export const configSchema = z.object({
  start_gold: num,
  parts: z.object({
    hull: z.object({ price: num, post: postKind }),
    mast: z.object({ price: num, post: postKind }),
    sail: z.object({ price: num, post: postKind }),
    map: z.object({ price: num, post: postKind }),
  }),
  stock_start: num,
  supply_ship_add: num,
  job_pay: z.object({ shipwright: num, sailmaker: num, cartographer: num, inn: num, blacksmith: num }),
  fail_pay: num,
  jobs_per_post: num.min(1),
  job_timer_seconds: num.min(5).max(300).default(45),
  items: z.object({
    flag: z.object({ price: num, raids: num }),
    sword: z.object({ price: num, bonus: num }),
    shield: z.object({ price: num }),
  }),
  raid: z.object({ steal: num, immune_minutes: z.number().min(0).max(60), max_times_raided: num }),
  events: z.object({
    gold_rush_bonus: num,
    gold_rush_minutes: z.number().min(0).max(60),
    storm_minutes: z.number().min(0).max(60),
    market_sale_discount: num,
    market_sale_minutes: z.number().min(0).max(60),
    pirate_hour_multiplier: num.min(1),
    pirate_hour_minutes: z.number().min(0).max(60),
    bounty_bonus: num,
    bounty_minutes: z.number().min(0).max(60),
    lighthouse_aid: num,
    price_dial_percent: z.number().int().min(1).max(90),
  }),
  scoring: z.object({
    per_part: num,
    boat_bonus: num,
    finish_order: z.array(num),
    gold_per_point: num.min(1),
    per_raid_win: num,
    most_raids_bonus: num,
    most_raids_min: num,
  }),
  clock: z.object({ play_start_minute: num, last_call_minute: num, end_minute: num }),
  schedule: z.array(z.object({ minute: z.number().min(0).max(120), kind: z.string() })),
  pace_check: z.record(
    z.string(),
    z.object({ normal: num, slow_at_or_below: num, fast_at_or_above: num }),
  ),
  post_rules: z.object({
    shipwright: z.string().max(300),
    sailmaker: z.string().max(300),
    cartographer: z.string().max(300),
    inn: z.string().max(300),
    blacksmith: z.string().max(300),
  }),
  test_force_roll: z
    .object({ attacker: z.number().int().min(1).max(6), defender: z.number().int().min(1).max(6) })
    .optional(),
});

export const baseSchema = z.object({
  type: z.string().min(1).max(40),
  action_id: z.uuid(),
});

const uuid = z.uuid();

export const inputSchemas = {
  ping: z.object({}),
  create_game: z.object({
    name: z.string().trim().min(1).max(40),
    config: configSchema.optional(),
  }),
  lookup_game: z.object({
    code: z.string().trim().min(1).max(6),
  }),
  join_with_pin: z.object({
    code: z.string().trim().min(1).max(6),
    role: z.enum(["mc", "team", "post"]),
    slot: z.number().int().min(1).max(5).optional(),
    post_kind: postKind.optional(),
    pin: z.string().trim().min(4).max(8),
    device_id: z.string().min(1).max(80),
  }),
  whoami: z.object({ device_id: z.string().min(1).max(80) }),
  get_pass: z.object({
    ttl_seconds: z.number().int().min(1).max(7200).optional(),
  }),
  tv_pass: z.object({
    code: z.string().trim().min(1).max(6),
  }),
  get_codes: z.object({}),
  get_my_rejoin: z.object({}),
  rotate_role: z.object({ role_id: uuid }),
  update_setup: z.object({
    config: configSchema.optional(),
    teams: z
      .array(
        z.object({
          id: uuid,
          name: z.string().trim().min(1).max(30),
          color: z.string().max(20),
          active: z.boolean().default(true),
        }),
      )
      .optional(),
    posts: z
      .array(
        z.object({
          id: uuid,
          name: z.string().trim().min(1).max(30),
          staff_name: z.string().trim().max(40),
          active: z.boolean().default(true),
        }),
      )
      .optional(),
  }),
  reset_game: z.object({ new_tokens: z.boolean().default(false) }),
  close_game: z.object({}),
  game_control: z.object({ action: z.enum(["ready", "unready", "start", "pause", "resume", "last_call", "end"]) }),
  record_job: z.object({ team_id: uuid, passed: z.boolean() }),
  buy_item: z.object({ team_id: uuid, item: z.enum(["hull", "mast", "sail", "map", "flag", "sword", "shield"]) }),
  undo_last: z.object({}),
  set_serving: z.object({ team_id: uuid.nullable() }),
  set_waiting: z.object({ count: z.number().int().min(0).max(99) }),
  arm_double: z.object({ on: z.boolean() }),
  fire_event: z.object({
    kind: z.enum([
      "gold_rush", "storm", "supply_ship", "lighthouse_aid", "market_sale",
      "pirate_hour", "bounty", "message", "last_call",
    ]),
    text: z.string().max(200).optional(),
    schedule_index: z.number().int().min(0).max(100).nullable().default(null),
  }),
  cancel_event: z.object({ event_id: uuid }),
  set_price_dial: z.object({ direction: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }),
  mc_adjust: z.object({
    team_id: uuid,
    field: z.enum([
      "gold", "raids_left", "raid_wins", "shield_count",
      "has_hull", "has_mast", "has_sail", "has_map", "has_flag", "has_sword",
    ]),
    value: z.number().int().min(-1000).max(1000),
    reason: z.string().trim().min(1).max(200),
  }),
  set_option: z.object({ name: z.enum(["auto_fire", "show_scores_on_tv", "rehearsal"]), on: z.boolean() }),
  reveal: z.object({ step: z.enum(["start", "next", "back"]) }),
  get_my_raid_code: z.object({}),
  start_raid: z.object({ defender_id: uuid, code: z.string().regex(/^\d{4}$/) }),
  unlock_raid_victim: z.object({ code: z.string().regex(/^\d{4}$/) }),
} as const;

export type ActionType = keyof typeof inputSchemas;
