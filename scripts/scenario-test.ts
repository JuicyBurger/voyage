// Rules test. Runs against a dev Supabase project through the real API.
// Usage: npm run test:scenario   (dev server must be running; see README)

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
const admin = db;

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
  actionId?: string,
) {
  const headers: Record<string, string> = { "content-type": "application/json", ...extra };
  if (token) headers["x-role-token"] = token;
  const res = await fetch(`${BASE}/api/action`, {
    method: "POST",
    headers,
    body: JSON.stringify({ type, action_id: actionId ?? randomUUID(), ...input }),
  });
  return (await res.json()) as Result;
}

async function team(id: string) {
  const { data } = await db.from("teams").select("*").eq("id", id).single();
  return data!;
}

async function stock(gameId: string, part: string) {
  const { data } = await db.from("stock").select("qty").eq("game_id", gameId).eq("part", part).single();
  return data!.qty as number;
}

// Creates a game and returns its ids and tokens.
async function newGame(config?: Record<string, unknown>, ip?: string) {
  const createIp = ip ?? `scenario-${randomUUID()}`;
  const created = await act(
    null,
    "create_game",
    { name: "Scenario test", ...(config ? { config } : {}) },
    { "x-host-password": HOST_PASSWORD, "x-forwarded-for": createIp },
  );
  if (!created.ok) throw new Error(`create_game failed: ${JSON.stringify(created)}`);
  const gameId = created.state!.game_id as string;
  const mc = created.state!.mc_token as string;
  const mcPin = created.state!.mc_pin as string;
  const code = created.state!.code as string;

  const tok = await act(mc, "get_codes");
  type Tok = { id: string; token: string; pin: string; role: string; team_id: string | null; post_id: string | null };
  const tokens = tok.state!.tokens as Tok[];
  const teams = tok.state!.teams as { id: string; slot: number; name: string }[];
  const posts = tok.state!.posts as { id: string; kind: string }[];
  const teamId = (slot: number) => teams.find((t) => t.slot === slot)!.id;
  const postToken = (kind: string) => tokens.find((t) => t.post_id === posts.find((p) => p.kind === kind)!.id)!.token;
  const teamToken = (slot: number) => tokens.find((t) => t.team_id === teamId(slot))!.token;
  const roleRow = (pred: (t: Tok) => boolean) => tokens.find(pred)!;
  return { gameId, mc, mcPin, code, teamId, postToken, teamToken, tokens, teams, posts, roleRow };
}

async function startGame(mc: string) {
  await act(mc, "game_control", { action: "ready" });
  await act(mc, "game_control", { action: "start" });
}

async function checkGoldMatchesLog(gameId: string) {
  const { data: allTeams } = await db.from("teams").select("id, gold").eq("game_id", gameId);
  const { data: acts } = await db.from("actions").select("team_id, amount").eq("game_id", gameId);
  for (const t of allTeams ?? []) {
    const sum = (acts ?? []).filter((a) => a.team_id === t.id).reduce((s, a) => s + a.amount, 0);
    check(`team ${t.id.slice(0, 4)}: gold = 30 + log`, t.gold === 30 + sum, { gold: t.gold, sum });
  }
}

async function main() {
  console.log(`Scenario test against ${BASE}\n`);
  await rulesForJobsAndBuying();
  await rulesForRaids();
  await rulesForEvents();
  await rulesForScoring();
  await rulesForHardening();
  await rulesForReviewFixes();
  await rulesForHostsAndCodes();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

async function rulesForJobsAndBuying() {
  const { gameId, mc, teamId, postToken, teamToken } = await newGame();

  const BEARS = teamId(1);
  const MAGPIES = teamId(2);
  const shipwright = postToken("shipwright");
  const sailmaker = postToken("sailmaker");
  const cartographer = postToken("cartographer");
  const inn = postToken("inn");

  // --- Before start -------------------------------------------------------
  console.log("Before start");
  const early = await act(shipwright, "record_job", { team_id: BEARS, passed: true });
  check("job before start is rejected", early.error_code === "NOT_STARTED", early);

  check("ready", (await act(mc, "game_control", { action: "ready" })).ok);
  check("start", (await act(mc, "game_control", { action: "start" })).ok);

  // --- Jobs and buying ----------------------------------------------------
  console.log("Jobs and buying");
  check("Bears start with 30", (await team(BEARS)).gold === 30);
  await act(shipwright, "record_job", { team_id: BEARS, passed: true });
  check("Shipwright Pass -> 42", (await team(BEARS)).gold === 42);
  const mast = await act(shipwright, "buy_item", { team_id: BEARS, item: "mast" });
  check("Buy Mast -> 7", mast.ok && (await team(BEARS)).gold === 7, mast);
  check("Mast stock 3 -> 2", (await stock(gameId, "mast")) === 2);

  const wrongPost = await act(sailmaker, "buy_item", { team_id: BEARS, item: "hull" });
  check("Sailmaker cannot sell a Hull", wrongPost.error_code === "WRONG_POST", wrongPost);
  const again = await act(shipwright, "buy_item", { team_id: BEARS, item: "mast" });
  check("Cannot buy a second Mast", again.error_code === "ALREADY_OWNED", again);
  const poor = await act(shipwright, "buy_item", { team_id: BEARS, item: "hull" });
  check("Not enough gold for Hull", poor.error_code === "NOT_ENOUGH_GOLD" && poor.args?.need === 55, poor);

  console.log("Job limit");
  const { data: cfgRow } = await db.from("games").select("config").eq("id", gameId).single();
  const jobsPerPost = (cfgRow!.config as { jobs_per_post: number }).jobs_per_post;
  for (let i = 0; i < jobsPerPost; i++) await act(inn, "record_job", { team_id: BEARS, passed: true });
  const overLimit = await act(inn, "record_job", { team_id: BEARS, passed: true });
  const goldAtLimit = 7 + jobsPerPost * 10;
  check("job over the post limit is JOB_LIMIT", overLimit.error_code === "JOB_LIMIT", overLimit);
  check(`Bears 7 + ${jobsPerPost}x10 = ${goldAtLimit}`, (await team(BEARS)).gold === goldAtLimit);
  check("gold unchanged on JOB_LIMIT", (await team(BEARS)).gold === goldAtLimit);

  console.log("Double Profit");
  check("arm Double Profit", (await act(teamToken(1), "arm_double", { on: true })).ok);
  await act(sailmaker, "record_job", { team_id: BEARS, passed: false });
  let b = await team(BEARS);
  check("Fail with Double armed pays 4, stays armed", b.gold === goldAtLimit + 4 && b.double_armed && !b.double_used, b);
  await act(sailmaker, "record_job", { team_id: BEARS, passed: true });
  b = await team(BEARS);
  const afterDouble = goldAtLimit + 4 + 24;
  check("Pass with Double armed pays 24, Double used", b.gold === afterDouble && !b.double_armed && b.double_used, b);
  const rearm = await act(teamToken(1), "arm_double", { on: true });
  check("Cannot arm Double again", rearm.error_code === "DOUBLE_USED", rearm);

  console.log("Undo");
  await act(shipwright, "buy_item", { team_id: BEARS, item: "hull" });
  b = await team(BEARS);
  check("Buy Hull -> gold and has Hull", b.gold === afterDouble - 55 && b.has_hull, b);
  const undo = await act(shipwright, "undo_last");
  b = await team(BEARS);
  check("Undo Hull: gold back", undo.ok && b.gold === afterDouble, undo);
  check("Undo Hull: part removed", !b.has_hull);
  check("Undo Hull: stock back to 3", (await stock(gameId, "hull")) === 3);

  console.log("Undo after spending");
  for (let i = 0; i < 4; i++) await act(cartographer, "record_job", { team_id: MAGPIES, passed: true });
  // Magpies: 30 + 48 = 78. Spend at the Shipwright, then the Cartographer tries to undo its +12.
  await act(shipwright, "buy_item", { team_id: MAGPIES, item: "hull" }); // 23 left
  await act(cartographer, "buy_item", { team_id: MAGPIES, item: "map" }); // can't afford 35
  await act(shipwright, "buy_item", { team_id: MAGPIES, item: "mast" }); // can't afford 35
  const m = await team(MAGPIES);
  await act(postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "sword" }); // 8 left
  const undoSpent = await act(cartographer, "undo_last");
  check(
    "Undo refused when the team spent the gold",
    m.gold === 23 && undoSpent.error_code === "UNDO_NO_GOLD",
    { gold: m.gold, undoSpent },
  );

  console.log("Boat finished");
  // Bears have Mast and afterDouble gold. Earn enough for Hull 55 + Sail 45 + Map 35 = 135.
  for (let i = 0; i < 3; i++) await act(shipwright, "record_job", { team_id: BEARS, passed: true });
  for (let i = 0; i < 2; i++) await act(sailmaker, "record_job", { team_id: BEARS, passed: true });
  for (let i = 0; i < 4; i++) await act(postToken("blacksmith"), "record_job", { team_id: BEARS, passed: true });
  const beforeParts = afterDouble + 36 + 24 + 40;
  await act(shipwright, "buy_item", { team_id: BEARS, item: "hull" });
  await act(sailmaker, "buy_item", { team_id: BEARS, item: "sail" });
  const lastPart = await act(cartographer, "buy_item", { team_id: BEARS, item: "map" });
  b = await team(BEARS);
  check("Boat finished: rank 1", lastPart.ok && b.boat_rank === 1 && !!b.boat_done_at, { lastPart, b });
  check(`Bears gold ${beforeParts} - 135 = ${beforeParts - 135}`, b.gold === beforeParts - 135, b.gold);
  const { data: ev } = await db.from("world_events").select("*").eq("game_id", gameId).eq("kind", "boat_finished");
  check("boat_finished event was sent", (ev ?? []).length === 1);

  console.log("Pause");
  await act(mc, "game_control", { action: "pause" });
  const paused = await act(inn, "record_job", { team_id: MAGPIES, passed: true });
  check("job while paused is rejected", paused.error_code === "PAUSED", paused);
  await act(mc, "game_control", { action: "resume" });

  console.log("Gold always matches the log");
  await checkGoldMatchesLog(gameId);
}

async function rulesForRaids() {
  const { data: base } = await db.from("games").select("config").order("created_at", { ascending: false }).limit(1).single();
  const config = base!.config as Record<string, unknown>;

  // Game B: the attacker always rolls 6, the defender 1.
  console.log("Raids (forced win)");
  {
    const { gameId, mc, teamId, postToken, teamToken } = await newGame({
      ...config,
      test_force_roll: { attacker: 6, defender: 1 },
    });
    const [BEARS, MAGPIES, PANGOLINS, MACAQUES, PHEASANTS] = [1, 2, 3, 4, 5].map(teamId);
    const magpies = teamToken(2);
    const codeOf = async (slot: number) => (await act(teamToken(slot), "get_my_raid_code")).state!.code as string;
    await startGame(mc);

    const noFlag = await act(magpies, "start_raid", { defender_id: MACAQUES, code: "0000" });
    check("raid without a Flag is rejected", noFlag.error_code === "NO_RAIDS", noFlag);

    for (let i = 0; i < 4; i++) await act(postToken("cartographer"), "record_job", { team_id: MAGPIES, passed: true });
    await act(postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "flag" });
    await act(postToken("inn"), "record_job", { team_id: MACAQUES, passed: true });
    let mg = await team(MAGPIES);
    check("Magpies: Flag, 3 raids, 63 gold", mg.has_flag && mg.raids_left === 3 && mg.gold === 63, mg);
    check("Macaques have 40", (await team(MACAQUES)).gold === 40);

    const own = await act(magpies, "start_raid", { defender_id: MAGPIES, code: await codeOf(2) });
    check("cannot raid your own team", own.error_code === "OWN_TEAM", own);

    // Bears try wrong codes until blocked.
    await act(postToken("blacksmith"), "buy_item", { team_id: BEARS, item: "flag" });
    const realCode = await codeOf(4);
    const wrong = realCode === "1111" ? "2222" : "1111";
    const w1 = await act(teamToken(1), "start_raid", { defender_id: MACAQUES, code: wrong });
    const w2 = await act(teamToken(1), "start_raid", { defender_id: MACAQUES, code: wrong });
    const w3 = await act(teamToken(1), "start_raid", { defender_id: MACAQUES, code: wrong });
    check("wrong code: 2 tries left", w1.error_code === "WRONG_CODE" && w1.args?.tries_left === 2, w1);
    check("wrong code: 1 try left", w2.error_code === "WRONG_CODE" && w2.args?.tries_left === 1, w2);
    check("3rd wrong code blocks raids", w3.error_code === "RAID_BLOCKED", w3);
    const blocked = await act(teamToken(1), "start_raid", { defender_id: MACAQUES, code: realCode });
    check("blocked even with the right code", blocked.error_code === "RAID_BLOCKED", blocked);
    check("wrong codes use no raid", (await team(BEARS)).raids_left === 3);

    const win = await act(magpies, "start_raid", { defender_id: MACAQUES, code: realCode });
    check("raid wins", win.ok && win.state?.result === "win" && win.state?.amount === 15, win);
    const mq = await team(MACAQUES);
    mg = await team(MAGPIES);
    check("Macaques 40 -> 25", mq.gold === 25, mq.gold);
    check("Magpies 63 -> 78, 1 win, 2 raids left", mg.gold === 78 && mg.raid_wins === 1 && mg.raids_left === 2, mg);
    const safeFor = (Date.parse(mq.immune_until) - Date.now()) / 1000;
    check("Macaques safe for about 3 minutes", safeFor > 170 && safeFor <= 181, safeFor);
    check("Macaques raided once", mq.times_raided === 1);
    const newCode = await codeOf(4);
    check("Macaques' code changed", newCode !== realCode);

    const again = await act(magpies, "start_raid", { defender_id: MACAQUES, code: newCode });
    check("second raid while safe is rejected", again.error_code === "DEFENDER_SAFE", again);
    check("rejected raid uses no raid", (await team(MAGPIES)).raids_left === 2);

    console.log("Shield");
    await act(postToken("blacksmith"), "buy_item", { team_id: PHEASANTS, item: "shield" });
    const shielded = await act(magpies, "start_raid", { defender_id: PHEASANTS, code: await codeOf(5) });
    const ph = await team(PHEASANTS);
    check("Shield blocks the raid", shielded.state?.result === "blocked", shielded);
    check("Shield is gone, gold unchanged", ph.shield_count === 0 && ph.gold === 15, ph);
    check("blocked raid uses a raid", (await team(MAGPIES)).raids_left === 1);
    check("Pheasants are safe after the block", Date.parse(ph.immune_until) > Date.now() + 170000);

    console.log("Double Profit on a raid");
    await act(magpies, "arm_double", { on: true });
    const dbl = await act(magpies, "start_raid", { defender_id: PANGOLINS, code: await codeOf(3) });
    check("doubled raid steals 30 (capped at their 30)", dbl.state?.amount === 30 && dbl.state?.doubled === true, dbl);
    check("Pangolins have 0", (await team(PANGOLINS)).gold === 0);
    mg = await team(MAGPIES);
    check("Double used, no raids left", mg.double_used && !mg.double_armed && mg.raids_left === 0, mg);
    const none = await act(magpies, "start_raid", { defender_id: BEARS, code: await codeOf(1) });
    check("no raids left is rejected", none.error_code === "NO_RAIDS", none);

    const { data: feed } = await db.from("raids").select("*").eq("game_id", gameId);
    check("3 raids recorded", (feed ?? []).length === 3);
    await checkGoldMatchesLog(gameId);
  }

  // Game C: dice always tie, and no safe time, so one team can be raided many times.
  console.log("Raids (tie, max raided, Last Call)");
  {
    const cfg = config as { raid: Record<string, number> };
    const { gameId, mc, teamId, postToken, teamToken } = await newGame({
      ...config,
      raid: { ...cfg.raid, immune_minutes: 0 },
      test_force_roll: { attacker: 3, defender: 3 },
    });
    const [BEARS, MAGPIES, , MACAQUES] = [1, 2, 3, 4].map(teamId);
    const codeOf = async (slot: number) => (await act(teamToken(slot), "get_my_raid_code")).state!.code as string;
    await startGame(mc);

    for (const t of [BEARS, MAGPIES]) {
      await act(postToken("blacksmith"), "buy_item", { team_id: t, item: "flag" });
    }
    await act(teamToken(2), "arm_double", { on: true });
    const tie = await act(teamToken(2), "start_raid", { defender_id: MACAQUES, code: await codeOf(4) });
    const mg = await team(MAGPIES);
    check("a tie goes to the defender", tie.state?.result === "loss", tie);
    check("lost raid: gold same, Double stays armed", mg.gold === 15 && mg.double_armed, mg);
    check("Macaques still have 30", (await team(MACAQUES)).gold === 30);

    await act(teamToken(2), "start_raid", { defender_id: MACAQUES, code: await codeOf(4) });
    await act(teamToken(2), "start_raid", { defender_id: MACAQUES, code: await codeOf(4) });
    check("Macaques raided 3 times", (await team(MACAQUES)).times_raided === 3);
    const max = await act(teamToken(1), "start_raid", { defender_id: MACAQUES, code: await codeOf(4) });
    check("4th raid on the same team is rejected", max.error_code === "MAX_RAIDED", max);

    await act(mc, "game_control", { action: "last_call" });
    const late = await act(teamToken(1), "start_raid", { defender_id: MAGPIES, code: await codeOf(2) });
    check("no raids after Last Call", late.error_code === "LAST_CALL", late);
    await checkGoldMatchesLog(gameId);
  }
}

async function rulesForEvents() {
  const { data: base } = await db.from("games").select("config").order("created_at", { ascending: false }).limit(1).single();
  const config = base!.config as { events: Record<string, number> } & Record<string, unknown>;

  // Storm lasts 3 seconds here so the test does not wait a full minute.
  const { gameId, mc, teamId, postToken, teamToken } = await newGame({
    ...config,
    events: { ...config.events, storm_minutes: 0.05 },
    test_force_roll: { attacker: 6, defender: 1 },
  });
  const [BEARS, MAGPIES, PANGOLINS, MACAQUES] = [1, 2, 3, 4].map(teamId);
  const fire = (kind: string, extra: Record<string, unknown> = {}) => act(mc, "fire_event", { kind, ...extra });
  const prices = async () => (await db.rpc("current_prices", { p_game_id: gameId })).data as Record<string, number>;
  await startGame(mc);

  console.log("Gold Rush");
  check("fire Gold Rush", (await fire("gold_rush")).ok);
  await act(postToken("sailmaker"), "record_job", { team_id: BEARS, passed: true });
  check("Gold Rush: Sailmaker Pass pays 17", (await team(BEARS)).gold === 47);
  await act(teamToken(1), "arm_double", { on: true });
  await act(postToken("sailmaker"), "record_job", { team_id: BEARS, passed: true });
  const b = await team(BEARS);
  check("Gold Rush + Double Profit pays 34", b.gold === 81 && b.double_used, b);

  console.log("Storm");
  check("fire Storm", (await fire("storm")).ok);
  const stormed = await act(postToken("inn"), "record_job", { team_id: BEARS, passed: true });
  check("job during Storm is rejected", stormed.error_code === "STORM", stormed);
  const stormSale = await act(postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "flag" });
  check("sale during Storm is rejected", stormSale.error_code === "STORM", stormSale);
  await new Promise((r) => setTimeout(r, 3500));
  const after = await act(postToken("inn"), "record_job", { team_id: BEARS, passed: true });
  check("job allowed after the Storm", after.ok, after);

  console.log("Supply Ship, Lighthouse Aid");
  await fire("supply_ship");
  check("Supply Ship: Hull stock 3 -> 5", (await stock(gameId, "hull")) === 5);
  await act(postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "flag" }); // Magpies 15
  const aid = await fire("lighthouse_aid");
  check("Lighthouse Aid goes to the poorest team", (await team(MAGPIES)).gold === 30 && (await team(PANGOLINS)).gold === 30, aid);

  console.log("Price dial, Market Sale");
  await act(mc, "set_price_dial", { direction: -1 });
  check("price dial -20%: Hull 44", (await prices()).hull === 44);
  await act(mc, "set_price_dial", { direction: 1 });
  check("price dial +20%: Mast 42", (await prices()).mast === 42);
  await act(mc, "set_price_dial", { direction: 0 });
  check("price dial off: Hull 55", (await prices()).hull === 55);
  const sale = await fire("market_sale");
  const salePart = sale.state?.part as string;
  const basePrice = { hull: 55, mast: 35, sail: 45, map: 35 }[salePart];
  check("Market Sale takes 10 off one part", (await prices())[salePart] === basePrice! - 10, sale);

  console.log("Pirate Hour + Bounty");
  await fire("pirate_hour");
  const bounty = await fire("bounty");
  check("Bounty names Bears as richest", JSON.stringify(bounty.state?.teams) === '["Bears"]', bounty);
  const bearsBefore = (await team(BEARS)).gold;
  const codeOf = async (slot: number) => (await act(teamToken(slot), "get_my_raid_code")).state!.code as string;
  const big = await act(teamToken(2), "start_raid", { defender_id: BEARS, code: await codeOf(1) });
  check("Pirate Hour + Bounty: steals 30 + 10", big.state?.amount === 40, big);
  check("Bears lost 40", (await team(BEARS)).gold === bearsBefore - 40);
  const capped = await act(teamToken(2), "start_raid", { defender_id: MACAQUES, code: await codeOf(4) });
  check("raid amount capped at the defender's gold (30)", capped.state?.amount === 30, capped);

  console.log("Restart, stop, schedule, message");
  await fire("gold_rush");
  const { data: rushes } = await db.from("world_events").select("*").eq("game_id", gameId).eq("kind", "gold_rush");
  const running = (rushes ?? []).filter((e) => Date.parse(e.ends_at) > Date.now());
  check("firing Gold Rush again restarts it (1 running)", running.length === 1 && (rushes ?? []).length === 2);
  check("stop an event early", (await act(mc, "cancel_event", { event_id: running[0].id })).ok);
  const rushNow = await act(postToken("cartographer"), "record_job", { team_id: PANGOLINS, passed: true });
  check("stopped Gold Rush pays no bonus", rushNow.state?.amount === 12, rushNow);
  check("scheduled event fires once", (await fire("supply_ship", { schedule_index: 2 })).ok);
  const twice = await fire("supply_ship", { schedule_index: 2 });
  check("scheduled event cannot fire twice", twice.error_code === "ALREADY_FIRED", twice);
  check("empty message is rejected", (await fire("message", { text: "  " })).error_code === "BAD_INPUT");
  check("custom message", (await fire("message", { text: "Lunch is ready!" })).ok);

  console.log("MC adjust");
  const adj = (field: string, value: number, reason = "test") =>
    act(mc, "mc_adjust", { team_id: PANGOLINS, field, value, reason });
  check("gold below 0 is refused", (await adj("gold", -1000)).error_code === "NEGATIVE_GOLD");
  check("adjust needs a reason", (await adj("gold", 5, "")).error_code === "BAD_INPUT");
  const pBefore = (await team(PANGOLINS)).gold;
  await adj("gold", 5);
  check("adjust gold +5", (await team(PANGOLINS)).gold === pBefore + 5);
  for (const f of ["has_hull", "has_mast", "has_sail", "has_map"]) await adj(f, 1);
  let p = await team(PANGOLINS);
  check("giving all 4 parts finishes the boat", p.boat_rank === 1 && !!p.boat_done_at, p);
  await adj("has_sail", 0);
  p = await team(PANGOLINS);
  check("removing a part clears the boat", p.boat_rank === null && !p.has_sail, p);

  console.log("Last Call from the event panel");
  check("fire Last Call", (await fire("last_call")).ok);
  const { data: g } = await db.from("games").select("status").eq("id", gameId).single();
  check("status is last_call", g!.status === "last_call");
  await checkGoldMatchesLog(gameId);
}

async function rulesForScoring() {
  console.log("Scoring");
  const { gameId, mc, teamId } = await newGame();
  const [BEARS, MAGPIES] = [1, 2].map(teamId);
  type Score = { team_id: string; total: number; place: number; most_raids_points: number };
  const scores = async () => (await db.rpc("game_scores", { p_game_id: gameId })).data as Score[];
  const scoreOf = async (id: string) => (await scores()).find((s) => s.team_id === id)!;
  const adj = (team_id: string, field: string, value: number) =>
    act(mc, "mc_adjust", { team_id, field, value, reason: "scoring test" });
  await startGame(mc);

  for (const f of ["has_hull", "has_mast", "has_sail", "has_map"]) await adj(BEARS, f, 1);
  await adj(BEARS, "gold", 12);
  const bears = await scoreOf(BEARS);
  check("4 parts, boat #1, 42 gold, 0 raid wins = 123", bears.total === 123, bears);
  check("Bears are in first place", bears.place === 1);

  await adj(MAGPIES, "raid_wins", 1);
  check("1 raid win: no most-raids bonus", (await scoreOf(MAGPIES)).most_raids_points === 0);
  await adj(MAGPIES, "raid_wins", 2);
  const mg = await scoreOf(MAGPIES);
  check("2 raid wins: +10 bonus (6 + 10 + 10 = 26)", mg.most_raids_points === 10 && mg.total === 26, mg);

  console.log("Final reveal");
  const early = await act(mc, "reveal", { step: "start" });
  check("reveal only after End", early.error_code === "NOT_ENDED", early);
  await act(mc, "game_control", { action: "end" });
  check("MC can still adjust after End", (await adj(MAGPIES, "gold", 5)).ok);
  check("start the reveal", (await act(mc, "reveal", { step: "start" })).ok);
  const locked = await adj(MAGPIES, "gold", 5);
  check("no adjusting once the reveal starts", locked.error_code === "REVEAL_LOCKED", locked);
  for (let i = 0; i < 7; i++) await act(mc, "reveal", { step: "next" });
  const { data: g } = await db.from("games").select("reveal_step, final_scores").eq("id", gameId).single();
  check("reveal stops at 5 places", g!.reveal_step === 5);
  check("frozen scores have 5 teams, Bears first", (g!.final_scores as Score[])[0].team_id === BEARS);
}

async function rulesForHardening() {
  console.log("Idempotency");
  const first = await newGame();
  const BEARS = first.teamId(1);
  await startGame(first.mc);
  const id = randomUUID();
  const job = { team_id: BEARS, passed: true };
  const once = await act(first.postToken("shipwright"), "record_job", job, {}, id);
  const twice = await act(first.postToken("shipwright"), "record_job", job, {}, id);
  check("the same action_id is accepted again", once.ok && twice.ok, { once, twice });
  check("the same action_id pays only once", (await team(BEARS)).gold === 42);

  console.log("Rehearsal");
  const late = await act(first.mc, "set_option", { name: "rehearsal", on: true });
  check("rehearsal cannot change after Start", late.error_code === "REHEARSAL_LOCKED", late);

  const g = await newGame();
  check("turn rehearsal on", (await act(g.mc, "set_option", { name: "rehearsal", on: true })).ok);
  const { data: row } = await db.from("games").select("rehearsal, speed").eq("id", g.gameId).single();
  check("clock speed is 4", row!.rehearsal === true && Number(row!.speed) === 4, row);
  await startGame(g.mc);

  await act(g.mc, "fire_event", { kind: "gold_rush" });
  const { data: ev } = await db
    .from("world_events")
    .select("starts_at, ends_at")
    .eq("game_id", g.gameId)
    .eq("kind", "gold_rush")
    .single();
  const rushSecs = (Date.parse(ev!.ends_at) - Date.parse(ev!.starts_at)) / 1000;
  check("2 event minutes last 30 real seconds at 4×", rushSecs > 28 && rushSecs < 32, rushSecs);

  const MAGPIES = g.teamId(2);
  const MACAQUES = g.teamId(4);
  await act(g.postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "flag" });
  const code = (await act(g.teamToken(4), "get_my_raid_code")).state!.code as string;
  const raid = await act(g.teamToken(2), "start_raid", { defender_id: MACAQUES, code });
  check("a raid works in rehearsal", raid.ok, raid);
  const safeFor = (Date.parse((await team(MACAQUES)).immune_until) - Date.now()) / 1000;
  check("3 immune minutes last about 45 real seconds", safeFor > 40 && safeFor < 50, safeFor);

  const wrong = code === "1111" ? "2222" : "1111";
  const bears = g.teamId(1);
  await act(g.teamToken(2), "start_raid", { defender_id: bears, code: wrong });
  await act(g.teamToken(2), "start_raid", { defender_id: bears, code: wrong });
  await act(g.teamToken(2), "start_raid", { defender_id: bears, code: wrong });
  const still = await act(g.teamToken(2), "start_raid", { defender_id: bears, code: wrong });
  const left = Number(still.args?.seconds_left);
  check("the 30 second wrong-code block stays real time", still.error_code === "RAID_BLOCKED" && left >= 25 && left <= 30, still);
}

async function rulesForReviewFixes() {
  console.log("Review fixes");
  {
    const { gameId, mc, teamId, postToken } = await newGame();
    const { data } = await db.from("games").select("config").eq("id", gameId).single();
    const cfg = data!.config as {
      jobs_per_post: number;
      pace_check: Record<string, unknown>;
      post_rules: { shipwright: string; blacksmith: string };
    };
    check("new game jobs_per_post is 6", cfg.jobs_per_post === 6, cfg.jobs_per_post);
    check(
      "new game pace_check keys are 20 and 25",
      JSON.stringify(Object.keys(cfg.pace_check).sort()) === JSON.stringify(["20", "25"]),
      Object.keys(cfg.pace_check),
    );
    check("new game shipwright job starts with Human Boat", cfg.post_rules.shipwright.startsWith("Human Boat"), cfg.post_rules.shipwright);
    check(
      "new game blacksmith job starts with Count Together",
      cfg.post_rules.blacksmith.startsWith("Count Together"),
      cfg.post_rules.blacksmith,
    );

    console.log("Jobs per post limit is 6, and per post");
    const BEARS = teamId(1);
    const inn = postToken("inn");
    const blacksmith = postToken("blacksmith");
    await startGame(mc);
    for (let i = 0; i < 6; i++) await act(inn, "record_job", { team_id: BEARS, passed: true });
    const goldAfter6 = (await team(BEARS)).gold;
    const seventh = await act(inn, "record_job", { team_id: BEARS, passed: true });
    check("7th Inn job is JOB_LIMIT", seventh.error_code === "JOB_LIMIT", seventh);
    check("7th Inn job does not change gold", (await team(BEARS)).gold === goldAfter6);
    const otherPost = await act(blacksmith, "record_job", { team_id: BEARS, passed: true });
    check("after 6 at Inn, Blacksmith job still works", otherPost.ok, otherPost);
  }

  const { data: base } = await db.from("games").select("config").order("created_at", { ascending: false }).limit(1).single();
  const config = base!.config as Record<string, unknown>;

  console.log("Raid on a team with no gold");
  {
    const { gameId, mc, teamId, postToken, teamToken } = await newGame({
      ...config,
      test_force_roll: { attacker: 6, defender: 1 },
    });
    const [MAGPIES, MACAQUES] = [2, 4].map(teamId);
    const magpies = teamToken(2);
    const codeOf = async (slot: number) => (await act(teamToken(slot), "get_my_raid_code")).state!.code as string;
    const adj = (team_id: string, field: string, value: number) =>
      act(mc, "mc_adjust", { team_id, field, value, reason: "test" });
    await startGame(mc);

    await act(postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "flag" });
    await act(postToken("blacksmith"), "buy_item", { team_id: MACAQUES, item: "shield" });
    check("set Macaques' gold to 0", (await adj(MACAQUES, "gold", -15)).ok);
    const before = await team(MACAQUES);
    const codeBefore = await codeOf(4);
    const { data: raidsBefore } = await db.from("raids").select("id").eq("game_id", gameId);

    const refused = await act(magpies, "start_raid", { defender_id: MACAQUES, code: codeBefore });
    const after = await team(MACAQUES);
    const { data: raidsAfter } = await db.from("raids").select("id").eq("game_id", gameId);

    check("raid on a broke team is NOTHING_TO_STEAL", refused.error_code === "NOTHING_TO_STEAL", refused);
    check("broke raid leaves 3 raids", (await team(MAGPIES)).raids_left === 3);
    check("broke raid does not change times raided", after.times_raided === before.times_raided, after);
    check(
      "broke raid does not change immunity",
      after.immune_until === before.immune_until,
      { before: before.immune_until, after: after.immune_until },
    );
    check("broke raid does not change the code", (await codeOf(4)) === codeBefore);
    check("broke raid writes no raids row", (raidsAfter ?? []).length === (raidsBefore ?? []).length);
    check("broke raid leaves the Shield", after.shield_count === 1, after);

    console.log("Raid on a team with a little gold");
    await adj(MACAQUES, "shield_count", 0);
    check("give Macaques 4 gold", (await adj(MACAQUES, "gold", 4)).ok);
    const goldBefore = (await team(MAGPIES)).gold;
    const small = await act(magpies, "start_raid", { defender_id: MACAQUES, code: await codeOf(4) });
    const mg = await team(MAGPIES);
    check("small raid wins and takes the 4 gold", small.ok && small.state?.result === "win" && small.state?.amount === 4, small);
    check("Magpies gained 4 and a raid win", mg.gold === goldBefore + 4 && mg.raid_wins === 1, mg);
    check("Macaques have 0", (await team(MACAQUES)).gold === 0);
  }

  console.log("Bounty targets stay fixed");
  {
    const { mc, teamId, postToken, teamToken } = await newGame({
      ...config,
      test_force_roll: { attacker: 6, defender: 1 },
    });
    const [BEARS, MAGPIES, PANGOLINS] = [1, 2, 3].map(teamId);
    const codeOf = async (slot: number) => (await act(teamToken(slot), "get_my_raid_code")).state!.code as string;
    const adj = (team_id: string, value: number) => act(mc, "mc_adjust", { team_id, field: "gold", value, reason: "test" });
    await startGame(mc);

    await adj(BEARS, 20);
    const bounty = await act(mc, "fire_event", { kind: "bounty" });
    const ids = bounty.state?.team_ids as string[] | undefined;
    check("Bounty team_ids is the Bears", JSON.stringify(ids) === JSON.stringify([BEARS]), bounty);

    await adj(PANGOLINS, 40);
    await act(postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "flag" });
    const miss = await act(teamToken(2), "start_raid", { defender_id: PANGOLINS, code: await codeOf(3) });
    check("raiding the new richest team has no Bounty", miss.state?.bounty === false && miss.state?.amount === 15, miss);

    const hit = await act(teamToken(2), "start_raid", { defender_id: BEARS, code: await codeOf(1) });
    check("raiding the named team adds the Bounty", hit.state?.bounty === true && hit.state?.amount === 25, hit);
  }

  console.log("Bounty tie");
  {
    const { mc, teamId, postToken, teamToken } = await newGame({
      ...config,
      test_force_roll: { attacker: 6, defender: 1 },
    });
    const [BEARS, MAGPIES, PANGOLINS] = [1, 2, 3].map(teamId);
    const codeOf = async (slot: number) => (await act(teamToken(slot), "get_my_raid_code")).state!.code as string;
    await startGame(mc);

    await act(mc, "mc_adjust", { team_id: BEARS, field: "gold", value: 10, reason: "test" });
    await act(mc, "mc_adjust", { team_id: PANGOLINS, field: "gold", value: 10, reason: "test" });
    const bounty = await act(mc, "fire_event", { kind: "bounty" });
    const ids = (bounty.state?.team_ids as string[] | undefined) ?? [];
    check(
      "tied richest teams are both Bounty targets",
      ids.length === 2 && ids.includes(BEARS) && ids.includes(PANGOLINS),
      bounty,
    );

    await act(postToken("blacksmith"), "buy_item", { team_id: MAGPIES, item: "flag" });
    const bears = await act(teamToken(2), "start_raid", { defender_id: BEARS, code: await codeOf(1) });
    const pangolins = await act(teamToken(2), "start_raid", { defender_id: PANGOLINS, code: await codeOf(3) });
    check("raiding either tied team adds the Bounty", bears.state?.bounty === true && bears.state?.amount === 25, bears);
    check("the other tied team also adds the Bounty", pangolins.state?.bounty === true && pangolins.state?.amount === 25, pangolins);
  }
}

async function rulesForHostsAndCodes() {
  console.log("Host passwords");
  {
    const ip = `host-test-${randomUUID().slice(0, 8)}`;
    const none = await act(null, "create_game", { name: "No pw" }, { "x-forwarded-for": ip });
    check("create without password is refused", none.error_code === "BAD_PASSWORD", none);

    let locked: Result | null = null;
    for (let i = 0; i < 5; i++) {
      locked = await act(
        null,
        "create_game",
        { name: "Wrong" },
        { "x-host-password": "not-a-real-password", "x-forwarded-for": ip },
      );
    }
    check("5 wrong host passwords lock the IP", locked?.error_code === "RATE_LIMITED", locked);
    check("lock says how long to wait", typeof locked?.args?.seconds_left === "number" && Number(locked?.args?.seconds_left) > 0, locked);

    const okIp = `host-ok-${randomUUID().slice(0, 8)}`;
    const created = await act(
      null,
      "create_game",
      { name: "CYUT Freshgrad Night" },
      { "x-host-password": HOST_PASSWORD, "x-forwarded-for": okIp },
    );
    check(
      "right password creates a game with code, name, MC token, MC PIN",
      !!(created.ok && created.state?.code && created.state?.name === "CYUT Freshgrad Night" && created.state?.mc_token && created.state?.mc_pin),
      created,
    );
    const pin = String(created.state?.mc_pin ?? "");
    check("MC PIN is 8 chars from the safe alphabet", /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/.test(pin), pin);
  }

  console.log("Two games stay separate");
  {
    const a = await newGame(undefined, `two-a-${randomUUID().slice(0, 8)}`);
    const b = await newGame(undefined, `two-b-${randomUUID().slice(0, 8)}`);
    await startGame(a.mc);
    await startGame(b.mc);
    const aTeam = a.teamId(1);
    const goldBefore = (await team(aTeam)).gold;
    const cross = await act(b.postToken("shipwright"), "record_job", { team_id: aTeam, passed: true });
    check("B's post cannot job A's team", !cross.ok, cross);
    check("A's gold unchanged after cross-game attempt", (await team(aTeam)).gold === goldBefore);
  }

  console.log("Join with PIN");
  {
    const g = await newGame(undefined, `join-${randomUUID().slice(0, 8)}`);
    const bears = g.roleRow((t) => t.team_id === g.teamId(1));
    const ip = `pin-${randomUUID().slice(0, 8)}`;
    const joined = await act(
      null,
      "join_with_pin",
      { code: g.code, role: "team", slot: 1, pin: bears.pin, device_id: "test-device" },
      { "x-forwarded-for": ip },
    );
    check("right PIN returns a working token", joined.ok && joined.state?.token === bears.token, joined);
    if (!joined.ok || !joined.state?.token) {
      // Skip the rest of this block if join failed; other blocks still run.
    } else {
    await startGame(g.mc);
    const job = await act(joined.state.token as string, "whoami", { device_id: "test-device" });
    check("joined token works for whoami", job.ok && job.state?.role === "team", job);

    const badIp = `pin-bad-${randomUUID().slice(0, 8)}`;
    let last: Result | null = null;
    for (let i = 0; i < 5; i++) {
      last = await act(
        null,
        "join_with_pin",
        { code: g.code, role: "team", slot: 1, pin: "999998", device_id: "x" },
        { "x-forwarded-for": badIp },
      );
    }
    check("5 wrong PINs lock the phone", last?.error_code === "RATE_LIMITED", last);

    let roleLast: Result | null = null;
    for (let i = 0; i < 20; i++) {
      roleLast = await act(
        null,
        "join_with_pin",
        { code: g.code, role: "team", slot: 1, pin: "999997", device_id: `d${i}` },
        { "x-forwarded-for": `role-ip-${i}-${randomUUID().slice(0, 4)}` },
      );
    }
    check("20 wrong PINs on one role lock that role", roleLast?.error_code === "RATE_LIMITED", roleLast);
    }
  }

  console.log("Unknown game code and lookup limit");
  {
    const ip = `lookup-${randomUUID().slice(0, 8)}`;
    const missing = await act(null, "lookup_game", { code: "ZZZZZZ" }, { "x-forwarded-for": ip });
    check("unknown game code is GAME_NOT_FOUND", missing.error_code === "GAME_NOT_FOUND", missing);

    let last: Result | null = null;
    for (let i = 0; i < 30; i++) {
      last = await act(null, "lookup_game", { code: "AAAAAA" }, { "x-forwarded-for": ip });
    }
    check("30 lookups lock the IP", last?.error_code === "RATE_LIMITED", last);
  }

  console.log("Rotate role");
  {
    const g = await newGame(undefined, `rot-${randomUUID().slice(0, 8)}`);
    const bears = g.roleRow((t) => t.team_id === g.teamId(1));
    const oldToken = bears.token;
    const oldPin = bears.pin;
    const rotated = await act(g.mc, "rotate_role", { role_id: bears.id });
    check("rotate returns a new token and PIN", rotated.ok && rotated.state?.token !== oldToken && rotated.state?.pin !== oldPin, rotated);

    const oldWrite = await act(oldToken, "whoami", { device_id: "old" });
    check("old token is BAD_TOKEN after rotate", oldWrite.error_code === "BAD_TOKEN", oldWrite);

    const rejoined = await act(
      null,
      "join_with_pin",
      { code: g.code, role: "team", slot: 1, pin: rotated.state!.pin, device_id: "new" },
      { "x-forwarded-for": `rot-join-${randomUUID().slice(0, 8)}` },
    );
    check("new PIN joins", rejoined.ok && rejoined.state?.token === rotated.state?.token, rejoined);
  }

  console.log("Cleanup");
  {
    const g = await newGame(undefined, `clean-${randomUUID().slice(0, 8)}`);
    const freshId = g.gameId;
    await admin.from("games").update({ created_at: new Date(Date.now() - 8 * 86400000).toISOString() }).eq("id", freshId);
    // Make a second fresh game that must survive.
    const keep = await newGame(undefined, `keep-${randomUUID().slice(0, 8)}`);
    const { data: cleaned } = await admin.rpc("cleanup_old_games");
    check("cleanup reports deleted games", (cleaned as { games: number })?.games >= 1, cleaned);
    const { data: gone } = await admin.from("games").select("id").eq("id", freshId).maybeSingle();
    const { data: stayed } = await admin.from("games").select("id").eq("id", keep.gameId).maybeSingle();
    check("8-day-old game is deleted", !gone);
    check("fresh game is kept", !!stayed);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
