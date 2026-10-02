// Load check. Many posts act at the same moment; gold must still match the log.
// Usage: npx tsx --env-file=.env.local scripts/load-check.ts   (dev server must be running)

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.SCENARIO_BASE_URL ?? "http://localhost:3000";
const HOST_PASSWORD = (process.env.HOST_PASSWORDS ?? process.env.MC_ADMIN_PASSWORD ?? "")
  .split(",")
  .map((p) => p.trim())
  .find(Boolean)!;
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Result = { ok: boolean; error_code?: string; state?: Record<string, unknown> };

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

async function act(token: string | null, type: string, input: Record<string, unknown> = {}, actionId = randomUUID()) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-role-token"] = token;
  else {
    headers["x-host-password"] = HOST_PASSWORD;
    headers["x-forwarded-for"] = `load-host-${randomUUID()}`;
  }
  const res = await fetch(`${BASE}/api/action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type, action_id: actionId, ...input }),
  });
  return (await res.json()) as Result;
}

async function freshGame() {
  const created = await act(null, "create_game", { name: "Load check" });
  if (!created.ok) throw new Error(`create_game failed: ${JSON.stringify(created)}`);
  const gameId = created.state!.game_id as string;
  const mc = created.state!.mc_token as string;
  const tok = await act(mc, "get_codes");
  type Tok = { token: string; role: string; team_id: string | null; post_id: string | null };
  const tokens = tok.state!.tokens as Tok[];
  const teams = tok.state!.teams as { id: string; name: string }[];
  const posts = tok.state!.posts as { id: string; kind: string }[];
  const postToken = (kind: string) => tokens.find((t) => t.post_id === posts.find((p) => p.kind === kind)!.id)!.token;
  await act(mc, "game_control", { action: "ready" });
  await act(mc, "game_control", { action: "start" });
  return { gameId, postToken, teams, posts };
}

async function main() {
  console.log(`Load check against ${BASE}\n`);

  console.log("Same tap twice, at the same moment");
  const once = await freshGame();
  const actionId = randomUUID();
  const doubled = await Promise.all([
    act(once.postToken("inn"), "record_job", { team_id: once.teams[0].id, passed: true }, actionId),
    act(once.postToken("inn"), "record_job", { team_id: once.teams[0].id, passed: true }, actionId),
  ]);
  check("both replies succeed", doubled.every((r) => r.ok), doubled);
  const { data: paid } = await db.from("teams").select("gold").eq("id", once.teams[0].id).single();
  check("that tap paid only once (40 gold)", paid!.gold === 40, paid);

  const { gameId, postToken, teams, posts } = await freshGame();

  console.log("All 5 posts, all 5 teams, 4 waves at once");
  for (let wave = 0; wave < 4; wave++) {
    const jobs = posts.flatMap((p) =>
      teams.map((t) => act(postToken(p.kind), "record_job", { team_id: t.id, passed: true })),
    );
    const results = await Promise.all(jobs);
    const bad = results.filter((r) => !r.ok);
    check(`wave ${wave + 1}: 25 jobs all recorded`, bad.length === 0, bad.slice(0, 3));
  }

  const over = await Promise.all(
    posts.flatMap((p) => teams.map((t) => act(postToken(p.kind), "record_job", { team_id: t.id, passed: true }))),
  );
  check("the 5th job at every post is refused", over.every((r) => r.error_code === "JOB_LIMIT"), over.find((r) => r.error_code !== "JOB_LIMIT"));

  console.log("5 teams buy the last hulls at the same moment");
  const buys = await Promise.all(teams.map((t) => act(postToken("shipwright"), "buy_item", { team_id: t.id, item: "hull" })));
  const sold = buys.filter((r) => r.ok).length;
  const { data: hull } = await db.from("stock").select("qty").eq("game_id", gameId).eq("part", "hull").single();
  check("exactly 3 hulls sold", sold === 3, buys.map((r) => r.error_code ?? "ok"));
  check("hull stock is 0", hull!.qty === 0, hull);

  console.log("Gold matches the log");
  const { data: rows } = await db.from("teams").select("id, name, gold").eq("game_id", gameId);
  const { data: acts } = await db.from("actions").select("team_id, amount").eq("game_id", gameId);
  for (const t of rows ?? []) {
    const sum = (acts ?? []).filter((a) => a.team_id === t.id).reduce((s, a) => s + a.amount, 0);
    check(`${t.name}: gold = 30 + log`, t.gold === 30 + sum, { gold: t.gold, sum });
  }

  console.log(failures ? `\n${failures} failed` : "\nLoad check passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
