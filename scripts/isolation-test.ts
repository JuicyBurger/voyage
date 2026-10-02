// Isolation tests for read passes (REST + Realtime). Dev server must be running.
// Usage: npx tsx --env-file=.env.local scripts/isolation-test.ts

import { randomUUID } from "node:crypto";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";

const BASE = process.env.SCENARIO_BASE_URL ?? "http://localhost:3000";
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const PUB =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
const HOST_PASSWORD = (process.env.HOST_PASSWORDS ?? "")
  .split(",")
  .map((p) => p.trim())
  .find(Boolean)!;

type Result = { ok: boolean; error_code?: string; args?: Record<string, unknown>; state?: Record<string, unknown> };

let failures = 0;
let passes = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passes++;
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}`, detail ?? "");
  }
}

async function act(
  token: string | null,
  type: string,
  input: Record<string, unknown> = {},
  extra: Record<string, string> = {},
) {
  const headers: Record<string, string> = { "content-type": "application/json", ...extra };
  if (token) headers["x-role-token"] = token;
  const res = await fetch(`${BASE}/api/action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type, action_id: randomUUID(), ...input }),
  });
  return (await res.json()) as Result;
}

function clientWithPass(pass: string | null): SupabaseClient {
  return createClient(URL, PUB, {
    accessToken: async () => pass ?? "",
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function wait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function createNamed(name: string) {
  const created = await act(
    null,
    "create_game",
    { name },
    { "x-host-password": HOST_PASSWORD, "x-forwarded-for": `iso-${randomUUID()}` },
  );
  if (!created.ok) throw new Error(`create_game ${name}: ${JSON.stringify(created)}`);
  const mc = created.state!.mc_token as string;
  const codes = await act(mc, "get_codes");
  const teams = codes.state!.teams as { id: string; slot: number }[];
  return {
    gameId: created.state!.game_id as string,
    code: created.state!.code as string,
    mc,
    team1: teams.find((t) => t.slot === 1)!.id,
  };
}

async function main() {
  console.log("Read isolation (REST)");
  const A = await createNamed("Isolation A");
  const B = await createNamed("Isolation B");

  const bare = clientWithPass(null);
  const { data: noPassTeams, error: noPassErr } = await bare.from("teams").select("id").eq("game_id", A.gameId);
  check("no pass → teams empty", (noPassTeams ?? []).length === 0, { noPassTeams, noPassErr });

  const passA = await act(A.mc, "get_pass");
  check("get_pass for A", !!passA.ok && !!passA.state?.pass, passA);
  const clientA = clientWithPass(passA.state!.pass as string);

  const { data: aTeams } = await clientA.from("teams").select("id, game_id").eq("game_id", A.gameId);
  check("pass A reads A's teams", (aTeams ?? []).length === 5, aTeams);

  const { data: bById } = await clientA.from("teams").select("id").eq("id", B.team1);
  check("pass A cannot read B team by id", (bById ?? []).length === 0, bById);

  const { data: pricesB } = await clientA.rpc("current_prices", { p_game_id: B.gameId });
  check("current_prices(B) with pass A is null", pricesB === null, pricesB);

  const { data: scoresB } = await clientA.rpc("game_scores", { p_game_id: B.gameId });
  check("game_scores(B) with pass A is null", scoresB === null, scoresB);

  for (const table of ["team_secrets", "role_tokens", "requests", "rate_limits"] as const) {
    const { data, error } = await clientA.from(table).select("*").limit(1);
    check(`pass cannot read ${table}`, (data ?? []).length === 0, { data, error });
  }

  console.log("TV pass");
  const tv = await act(null, "tv_pass", { code: A.code }, { "x-forwarded-for": `tv-${randomUUID()}` });
  check("tv_pass ok", !!tv.ok && !!tv.state?.pass, tv);
  const tvClient = clientWithPass(tv.state!.pass as string);
  const { data: tvTeams } = await tvClient.from("teams").select("id").eq("game_id", A.gameId);
  check("TV reads own game", (tvTeams ?? []).length === 5, tvTeams);
  const { data: tvOther } = await tvClient.from("teams").select("id").eq("game_id", B.gameId);
  check("TV cannot read other game", (tvOther ?? []).length === 0, tvOther);
  const tvWrite = await act(tv.state!.pass as string, "game_control", { action: "ready" });
  check("TV pass is not a write token", tvWrite.error_code === "BAD_TOKEN", tvWrite);

  console.log("Pass expiry");
  const short = await act(A.mc, "get_pass", { ttl_seconds: 5 });
  check("short ttl pass minted", !!short.ok && !!short.state?.pass, short);
  const shortClient = clientWithPass(short.state!.pass as string);
  const { data: beforeExp } = await shortClient.from("teams").select("id").eq("game_id", A.gameId);
  check("short pass works immediately", (beforeExp ?? []).length === 5, beforeExp);
  // PostgREST allows a JWT clock-skew leeway (~30s), so wait past ttl + leeway.
  await wait(40000);
  const { data: afterExp, error: afterErr } = await shortClient.from("teams").select("id").eq("game_id", A.gameId);
  check("expired pass cannot read", (afterExp ?? []).length === 0 || !!afterErr, { afterExp, afterErr });
  const refreshed = await act(A.mc, "get_pass");
  check("refresh after expiry", !!refreshed.ok && !!refreshed.state?.pass, refreshed);

  console.log("Rotate blocks get_pass");
  const codes = await act(A.mc, "get_codes");
  const bears = (codes.state!.tokens as { id: string; token: string; team_id: string | null; role: string }[]).find(
    (t) => t.role === "team" && t.team_id === A.team1,
  )!;
  const oldToken = bears.token;
  const rotated = await act(A.mc, "rotate_role", { role_id: bears.id });
  check("rotate ok", !!rotated.ok, rotated);
  const oldPass = await act(oldToken, "get_pass");
  check("old token get_pass is BAD_TOKEN", oldPass.error_code === "BAD_TOKEN", oldPass);

  console.log("Read isolation (Realtime)");
  const passA2 = await act(A.mc, "get_pass");
  const rtA = clientWithPass(passA2.state!.pass as string);
  let sawB = false;
  let sawA = false;
  const chB: RealtimeChannel = rtA
    .channel(`iso-b-${randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "teams", filter: `id=eq.${B.team1}` },
      () => {
        sawB = true;
      },
    );
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("subscribe B timeout")), 8000);
    chB.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        clearTimeout(t);
        resolve();
      }
    });
  });
  const admin = createClient(URL, SECRET);
  await admin.from("teams").update({ name: `B-${Date.now()}` }).eq("id", B.team1);
  await wait(3000);
  check("pass A subscribed to B receives nothing", !sawB, { sawB });
  void rtA.removeChannel(chB);

  const chA: RealtimeChannel = rtA
    .channel(`iso-a-${randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "teams", filter: `id=eq.${A.team1}` },
      () => {
        sawA = true;
      },
    );
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("subscribe A timeout")), 8000);
    chA.subscribe((s) => {
      if (s === "SUBSCRIBED") {
        clearTimeout(t);
        resolve();
      }
    });
  });
  await admin.from("teams").update({ name: `A-${Date.now()}` }).eq("id", A.team1);
  await wait(3000);
  check("pass A subscribed to A receives event", sawA, { sawA });
  void rtA.removeChannel(chA);

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
