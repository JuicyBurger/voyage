import { baseSchema, inputSchemas, type ActionType } from "@/lib/schemas";
import { clientIp, handlers, type Actor } from "@/lib/server/handlers";
import { supabaseServer } from "@/lib/supabase-server";

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json({ server_now: Date.now(), ...body }, { status, headers: { "cache-control": "no-store" } });
}

async function lookupActor(token: string): Promise<Actor | null> {
  const { data } = await supabaseServer()
    .from("role_tokens")
    .select("id, token, role, game_id, team_id, post_id")
    .eq("token", token)
    .maybeSingle();
  return (data as Actor) ?? null;
}

function hasTestHook(input: Record<string, unknown>) {
  const config = input.config as Record<string, unknown> | undefined;
  return !!config && "test_force_roll" in config;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return reply({ ok: false, error_code: "BAD_INPUT" }, 400);
  }

  const base = baseSchema.safeParse(body);
  if (!base.success) return reply({ ok: false, error_code: "BAD_INPUT" }, 400);
  const { type, action_id } = base.data;

  const handler = handlers[type];
  const schema = inputSchemas[type as ActionType];
  if (!handler || !schema) return reply({ ok: false, error_code: "BAD_INPUT" }, 400);

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return reply({ ok: false, error_code: "BAD_INPUT", message: parsed.error.issues[0]?.message }, 400);
  }
  const input = parsed.data as Record<string, unknown>;

  if (hasTestHook(input) && process.env.ALLOW_TEST_HOOKS !== "1") {
    return reply({ ok: false, error_code: "NOT_ALLOWED" }, 403);
  }

  const token = req.headers.get("x-role-token");
  const hostPassword = req.headers.get("x-host-password");
  const ip = clientIp(req);
  let actor: Actor | null = null;

  if (handler.auth === "token") {
    actor = token ? await lookupActor(token) : null;
    if (!actor) return reply({ ok: false, error_code: "BAD_TOKEN" }, 401);
    if (handler.roles && !handler.roles.includes(actor.role)) {
      return reply({ ok: false, error_code: "NOT_ALLOWED" }, 403);
    }
  }

  // Host password is checked inside create_game so wrong guesses can be rate-limited.
  try {
    const result = await handler.run(
      { actor, actionId: action_id, token, clientIp: ip, hostPassword },
      input,
    );
    const status =
      result.ok === false && (result.error_code === "BAD_PASSWORD" || result.error_code === "BAD_TOKEN")
        ? 401
        : result.ok === false && result.error_code === "RATE_LIMITED"
          ? 429
          : 200;
    return reply(result, status);
  } catch (e) {
    console.error(`action ${type} failed`, e);
    return reply({ ok: false, error_code: "SERVER_ERROR" }, 500);
  }
}
