import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { mintReadPass } from "@/lib/server/mint-pass";
import { supabaseServer } from "@/lib/supabase-server";
import type { Role } from "@/lib/types";

export type Actor = {
  id: string;
  token: string;
  role: Role;
  game_id: string;
  team_id: string | null;
  post_id: string | null;
};

export type Auth = "none" | "host" | "token";

type Ctx = {
  actor: Actor | null;
  actionId: string;
  token: string | null;
  clientIp: string;
  hostPassword: string | null;
};
type Input = Record<string, unknown>;
type Result = Record<string, unknown>;

export type Handler = {
  auth: Auth;
  roles?: Role[];
  run: (ctx: Ctx, input: Input) => Promise<Result>;
};

export async function rpc(fn: string, args: Record<string, unknown>): Promise<Result> {
  const { data, error } = await supabaseServer().rpc(fn, args);
  if (error) {
    console.error(`rpc ${fn} failed`, error);
    return { ok: false, error_code: "SERVER_ERROR" };
  }
  return data as Result;
}

export function hostTag(password: string) {
  return createHash("sha256").update(password).digest("hex").slice(0, 8);
}

/** Timing-safe match against any password in HOST_PASSWORDS (comma-separated). */
export function hostPasswordOk(given: string | null): string | null {
  if (!given) return null;
  const list = (process.env.HOST_PASSWORDS ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const a = Buffer.from(given);
  for (const expected of list) {
    const b = Buffer.from(expected);
    if (a.length === b.length && timingSafeEqual(a, b)) return expected;
  }
  return null;
}

export function clientIp(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

async function rateHit(
  key: string,
  max: number,
  windowSecs: number,
  lockSecs: number,
  doubling = false,
): Promise<Result | null> {
  const res = await rpc("_rate_hit", {
    p_key: key,
    p_max: max,
    p_window_secs: windowSecs,
    p_lock_secs: lockSecs,
    p_double: doubling,
  });
  if (res && res.ok === false) return res;
  return null;
}

export const handlers: Record<string, Handler> = {
  ping: {
    auth: "none",
    run: async () => ({ ok: true }),
  },

  create_game: {
    auth: "host",
    run: async (ctx, input) => {
      const matched = hostPasswordOk(ctx.hostPassword);
      if (!matched) {
        const limited = await rateHit(`host:${ctx.clientIp}`, 5, 600, 900);
        if (limited) return limited;
        return { ok: false, error_code: "BAD_PASSWORD" };
      }
      const limited = await rateHit(`create:${ctx.clientIp}`, 10, 3600, 3600);
      if (limited) return limited;
      return rpc("create_game", {
        p_action_id: ctx.actionId,
        p_config: input.config ?? null,
        p_name: input.name,
        p_host_tag: hostTag(matched),
      });
    },
  },

  lookup_game: {
    auth: "none",
    run: (ctx, input) =>
      rpc("lookup_game", { p_code: input.code, p_ip: ctx.clientIp }),
  },

  join_with_pin: {
    auth: "none",
    run: (ctx, input) =>
      rpc("join_with_pin", {
        p_code: input.code,
        p_role: input.role,
        p_slot: input.slot ?? null,
        p_post_kind: input.post_kind ?? null,
        p_pin: input.pin,
        p_device_id: input.device_id,
        p_ip: ctx.clientIp,
      }),
  },

  whoami: {
    auth: "none",
    run: async (ctx, input) => {
      if (!ctx.token) return { ok: false, error_code: "BAD_TOKEN" };
      return rpc("touch_role", { p_token: ctx.token, p_device_id: input.device_id });
    },
  },

  get_pass: {
    auth: "token",
    run: async (ctx, input) => {
      const actor = ctx.actor!;
      let ttl = 7200;
      if (typeof input.ttl_seconds === "number") {
        if (process.env.ALLOW_TEST_HOOKS !== "1") {
          return { ok: false, error_code: "NOT_ALLOWED" };
        }
        ttl = Math.min(Math.max(1, Math.floor(input.ttl_seconds as number)), 7200);
      }
      const minted = await mintReadPass(
        {
          sub: actor.id,
          game_id: actor.game_id,
          vc_role: actor.role,
          team_id: actor.team_id,
          post_id: actor.post_id,
        },
        ttl,
      );
      return { ok: true, state: { pass: minted.pass, exp: minted.exp } };
    },
  },

  tv_pass: {
    auth: "none",
    run: async (ctx, input) => {
      const limited = await rateHit(`tv:${ctx.clientIp}`, 30, 600, 600);
      if (limited) return limited;
      const code = String(input.code ?? "")
        .trim()
        .toUpperCase();
      const { data: game } = await supabaseServer()
        .from("games")
        .select("id, code, name")
        .eq("code", code)
        .maybeSingle();
      if (!game) return { ok: false, error_code: "GAME_NOT_FOUND" };
      const minted = await mintReadPass(
        {
          sub: game.id,
          game_id: game.id,
          vc_role: "tv",
          team_id: null,
          post_id: null,
        },
        7200,
      );
      return {
        ok: true,
        state: {
          pass: minted.pass,
          exp: minted.exp,
          game_id: game.id,
          code: game.code,
          name: game.name,
        },
      };
    },
  },

  get_codes: {
    auth: "token",
    roles: ["mc"],
    run: async (ctx) => {
      const db = supabaseServer();
      const gameId = ctx.actor!.game_id;
      const [tokens, teams, posts, game] = await Promise.all([
        db.from("role_tokens").select("id, token, pin, role, team_id, post_id").eq("game_id", gameId),
        db.from("teams").select("id, slot, name, color").eq("game_id", gameId),
        db.from("posts").select("id, kind, name, staff_name").eq("game_id", gameId),
        db.from("games").select("code, name, expires_at").eq("id", gameId).single(),
      ]);
      return {
        ok: true,
        state: {
          tokens: tokens.data,
          teams: teams.data,
          posts: posts.data,
          code: game.data?.code,
          name: game.data?.name,
          expires_at: game.data?.expires_at,
        },
      };
    },
  },

  get_my_rejoin: {
    auth: "token",
    run: async (ctx) => {
      const db = supabaseServer();
      const token = ctx.token!;
      const [{ data: rt }, { data: game }] = await Promise.all([
        db.from("role_tokens").select("pin, role, team_id, post_id").eq("token", token).maybeSingle(),
        db.from("games").select("code, name").eq("id", ctx.actor!.game_id).single(),
      ]);
      if (!rt || !game) return { ok: false, error_code: "BAD_TOKEN" };
      let label = "MC";
      if (rt.role === "team" && rt.team_id) {
        const { data: t } = await db.from("teams").select("name").eq("id", rt.team_id).single();
        label = t?.name ?? "Team";
      } else if (rt.role === "post" && rt.post_id) {
        const { data: p } = await db.from("posts").select("name").eq("id", rt.post_id).single();
        label = p?.name ?? "Post";
      }
      return {
        ok: true,
        state: { code: game.code, game_name: game.name, pin: rt.pin, role: rt.role, label },
      };
    },
  },

  rotate_role: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("rotate_role", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_role_id: input.role_id,
      }),
  },

  update_setup: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("update_setup", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_config: input.config ?? null,
        p_teams: input.teams ?? null,
        p_posts: input.posts ?? null,
      }),
  },

  reset_game: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("reset_game", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_new_tokens: input.new_tokens ?? false,
      }),
  },

  game_control: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("game_control", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_action: input.action,
      }),
  },

  record_job: {
    auth: "token",
    roles: ["post"],
    run: (ctx, input) =>
      rpc("record_job", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_post_id: ctx.actor!.post_id,
        p_team_id: input.team_id,
        p_passed: input.passed,
      }),
  },

  buy_item: {
    auth: "token",
    roles: ["post"],
    run: (ctx, input) =>
      rpc("buy_item", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_post_id: ctx.actor!.post_id,
        p_team_id: input.team_id,
        p_item: input.item,
      }),
  },

  undo_last: {
    auth: "token",
    roles: ["post"],
    run: (ctx) =>
      rpc("undo_last", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_post_id: ctx.actor!.post_id,
      }),
  },

  set_serving: {
    auth: "token",
    roles: ["post"],
    run: (ctx, input) =>
      rpc("set_serving", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_post_id: ctx.actor!.post_id,
        p_team_id: input.team_id,
      }),
  },

  set_waiting: {
    auth: "token",
    roles: ["post"],
    run: (ctx, input) =>
      rpc("set_waiting", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_post_id: ctx.actor!.post_id,
        p_count: input.count,
      }),
  },

  arm_double: {
    auth: "token",
    roles: ["team"],
    run: (ctx, input) =>
      rpc("arm_double", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_team_id: ctx.actor!.team_id,
        p_on: input.on,
      }),
  },

  fire_event: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("fire_event", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_kind: input.kind,
        p_payload: { text: input.text ?? null },
        p_schedule_index: input.schedule_index,
      }),
  },

  cancel_event: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("cancel_event", { p_action_id: ctx.actionId, p_game_id: ctx.actor!.game_id, p_event_id: input.event_id }),
  },

  set_price_dial: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("set_price_dial", { p_action_id: ctx.actionId, p_game_id: ctx.actor!.game_id, p_direction: input.direction }),
  },

  mc_adjust: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("mc_adjust", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_team_id: input.team_id,
        p_field: input.field,
        p_value: input.value,
        p_reason: input.reason,
      }),
  },

  set_option: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("set_option", { p_action_id: ctx.actionId, p_game_id: ctx.actor!.game_id, p_name: input.name, p_on: input.on }),
  },

  reveal: {
    auth: "token",
    roles: ["mc"],
    run: (ctx, input) =>
      rpc("reveal", { p_action_id: ctx.actionId, p_game_id: ctx.actor!.game_id, p_step: input.step }),
  },

  get_my_raid_code: {
    auth: "token",
    roles: ["team"],
    run: (ctx) => rpc("get_my_raid_code", { p_game_id: ctx.actor!.game_id, p_team_id: ctx.actor!.team_id }),
  },

  start_raid: {
    auth: "token",
    roles: ["team"],
    run: (ctx, input) =>
      rpc("start_raid", {
        p_action_id: ctx.actionId,
        p_game_id: ctx.actor!.game_id,
        p_attacker_id: ctx.actor!.team_id,
        p_defender_id: input.defender_id,
        p_code: input.code,
      }),
  },
};
