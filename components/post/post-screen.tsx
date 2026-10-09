"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus, Timer, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { EventBanner } from "@/components/game/event-banner";
import { GameBar } from "@/components/game/game-bar";
import { RejoinCodeCard } from "@/components/game/rejoin-code-card";
import { RevealOverlay } from "@/components/game/reveal-view";
import { StormOverlay } from "@/components/game/storm-overlay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { sendAction } from "@/lib/api";
import { activeEvent, isPlaying } from "@/lib/clock";
import { teamColor } from "@/lib/colors";
import { copy, errorMessage, itemName } from "@/lib/copy";
import { hasPart } from "@/lib/next-step";
import { POST_ICONS } from "@/lib/post-icons";
import { PARTS, type Identity, type Item, type Part, type Team } from "@/lib/types";
import { useGame, type GameData } from "@/lib/use-game";
import { useNow } from "@/lib/use-now";

const UNDO_MS = 2 * 60 * 1000;

export function PostScreen({ identity }: { identity: Identity }) {
  const postId = identity.post_id!;
  const { data, connected, refresh } = useGame(identity.game_id, { column: "actor_post_id", value: postId }, 20);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const now = useNow();

  if (!data) return <main className="p-6 text-lg">{copy.common.loading}</main>;

  const post = data.posts.find((p) => p.id === postId)!;
  const Icon = POST_ICONS[post.kind];
  const selected = data.teams.find((t) => t.id === selectedId) ?? null;
  const serving = data.teams.find((t) => t.id === post.serving_team_id) ?? null;

  async function run(type: string, input: Record<string, unknown>, onOk?: (state: Record<string, unknown>) => void) {
    if (busy) return;
    setBusy(true);
    const res = await sendAction(type, input);
    setBusy(false);
    if (res.ok) onOk?.(res.state ?? {});
    else toast.error(errorMessage(res.error_code, res.args));
    void refresh();
  }

  function selectTeam(team: Team) {
    setSelectedId(team.id);
    if (post.serving_team_id !== team.id) void run("set_serving", { team_id: team.id });
  }

  function clearServing() {
    void run("set_serving", { team_id: null }, () => setSelectedId(null));
  }

  // This post's last job or sale that can still be undone.
  const lastAction = data.actions.find((a) => ["job_pass", "job_fail", "buy"].includes(a.kind) && !a.undone_at);
  const undoLeft = lastAction ? UNDO_MS - (now - Date.parse(lastAction.created_at)) : 0;
  const undoTeam = lastAction ? data.teams.find((t) => t.id === lastAction.team_id) : null;
  const undoWhat = lastAction
    ? lastAction.kind === "buy"
      ? `${undoTeam?.name} ${itemName(lastAction.item)}`
      : `${undoTeam?.name} +${lastAction.amount}`
    : "";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <GameBar
        game={data.game}
        events={data.events}
        title={post.name}
        subtitle={post.staff_name ?? undefined}
        icon={<Icon className="size-8" />}
        connected={connected}
      />
      <EventBanner events={data.events} />
      <StormOverlay game={data.game} events={data.events} />
      <RevealOverlay game={data.game} scores={data.scores} />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-3">
        <div className={`grid gap-2 ${data.teams.filter((t) => t.active !== false).length <= 3 ? "grid-cols-3" : "grid-cols-5"}`}>
          {data.teams
            .filter((t) => t.active !== false)
            .map((t) => {
              const c = teamColor(t.color);
              const isSel = t.id === selectedId;
              return (
                <button
                  key={t.id}
                  onClick={() => selectTeam(t)}
                  className="flex h-16 items-center justify-center rounded-xl px-1 text-sm leading-tight font-bold wrap-break-word transition-transform active:scale-95"
                  style={{
                    background: c.bg,
                    color: c.text,
                    outline: isSel ? "4px solid #0f172a" : "none",
                    outlineOffset: 2,
                    opacity: selectedId && !isSel ? 0.55 : 1,
                  }}
                >
                  {t.name}
                </button>
              );
            })}
        </div>

        {selected ? (
          <SelectedTeam data={data} team={selected} postKind={post.kind} postId={postId} busy={busy} run={run} now={now} />
        ) : (
          <p className="py-8 text-center text-xl text-muted-foreground">{copy.post.pickTeam}</p>
        )}

        {lastAction && undoLeft > 0 && (selected || serving) && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => run("undo_last", {}, () => toast.success(copy.post.toastUndo))}
            className="h-12 text-base"
          >
            <Undo2 className="size-5" />
            {copy.post.undo(undoWhat, formatLeft(undoLeft))}
          </Button>
        )}

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold">
                {serving ? copy.post.serving(serving.name) : copy.post.notServing}
              </span>
              {serving && (
                <Button variant="secondary" disabled={busy} onClick={clearServing} className="h-11 px-5 text-base">
                  {copy.post.done}
                </Button>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-base font-semibold">{copy.post.waiting}</span>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  aria-label="Fewer waiting"
                  onClick={() => sendAction("set_waiting", { count: Math.max(0, post.waiting_count - 1) })}
                  className="size-12"
                >
                  <Minus className="size-5" />
                </Button>
                <span className="w-8 text-center text-2xl font-bold tabular-nums">{post.waiting_count}</span>
                <Button
                  variant="outline"
                  aria-label="More waiting"
                  onClick={() => sendAction("set_waiting", { count: post.waiting_count + 1 })}
                  className="size-12"
                >
                  <Plus className="size-5" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {data.game.config.post_rules?.[post.kind] && (
          <p className="rounded-lg bg-slate-200 px-3 py-2 text-sm">{data.game.config.post_rules[post.kind]}</p>
        )}
        <RejoinCodeCard />
      </main>
    </div>
  );
}

function formatLeft(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function SelectedTeam({
  data,
  team,
  postKind,
  postId,
  busy,
  run,
  now,
}: {
  data: GameData;
  team: Team;
  postKind: string;
  postId: string;
  busy: boolean;
  run: (type: string, input: Record<string, unknown>, onOk?: (s: Record<string, unknown>) => void) => Promise<void>;
  now: number;
}) {
  const cfg = data.game.config;
  const c = teamColor(team.color);
  const done = data.jobCounts.find((j) => j.team_id === team.id && j.post_id === postId)?.count ?? 0;
  const jobsFull = done >= cfg.jobs_per_post;
  const storm = activeEvent(data.events, "storm", now);
  const open = isPlaying(data.game) && !storm;
  const locked = !!team.raid_locked_by;
  const timerSecs = cfg.job_timer_seconds ?? 45;

  const [left, setLeft] = useState<number | null>(null);
  const endsAt = useRef<number | null>(null);
  const autoFailed = useRef(false);
  const teamIdRef = useRef(team.id);
  const openRef = useRef(open);
  const lockedRef = useRef(locked);
  const jobsFullRef = useRef(jobsFull);
  const busyRef = useRef(busy);
  openRef.current = open;
  lockedRef.current = locked;
  jobsFullRef.current = jobsFull;
  busyRef.current = busy;

  const rush = activeEvent(data.events, "gold_rush", now) ? cfg.events.gold_rush_bonus : 0;
  const passAmount = (cfg.job_pay[postKind as keyof typeof cfg.job_pay] + rush) * (team.double_armed ? 2 : 1);

  // Owned items stay listed (disabled, "Sudah punya") so the section never disappears.
  const forSale: Item[] = [
    ...PARTS.filter((p) => cfg.parts[p].post === postKind),
    ...(postKind === "blacksmith" ? (["flag", "sword", "shield"] as Item[]) : []),
  ];

  function clearTimer() {
    endsAt.current = null;
    setLeft(null);
  }

  function job(passed: boolean) {
    clearTimer();
    void run("record_job", { team_id: team.id, passed }, (s) =>
      toast.success(
        copy.post.toastJob(
          team.name,
          Number(s.amount),
          Boolean(s.doubled),
          Boolean(s.gold_rush) || (passed && rush > 0),
        ),
      ),
    );
  }

  // Reset the challenge timer whenever a different team is selected.
  useEffect(() => {
    teamIdRef.current = team.id;
    endsAt.current = null;
    autoFailed.current = false;
    setLeft(null);
  }, [team.id]);

  // Tick the countdown; at 0 without Pass → auto Fail once.
  useEffect(() => {
    if (left === null) return;
    const id = window.setInterval(() => {
      if (endsAt.current === null) return;
      const next = Math.max(0, Math.ceil((endsAt.current - Date.now()) / 1000));
      if (next > 0) {
        setLeft(next);
        return;
      }
      if (autoFailed.current) return;
      autoFailed.current = true;
      endsAt.current = null;
      setLeft(null);
      // Only auto-fail if the post is still open (not Storm / paused / ended).
      if (!openRef.current || lockedRef.current || jobsFullRef.current || busyRef.current) return;
      const tid = teamIdRef.current;
      void run("record_job", { team_id: tid, passed: false }, (s) =>
        toast.success(copy.post.toastJob(team.name, Number(s.amount), Boolean(s.doubled), Boolean(s.gold_rush))),
      );
    }, 200);
    return () => window.clearInterval(id);
  }, [left === null, team.name, run]);

  // Storm / close / lock: cancel an in-flight challenge timer.
  useEffect(() => {
    if (open && !locked && !jobsFull) return;
    clearTimer();
    autoFailed.current = false;
  }, [open, locked, jobsFull]);

  function reasonFor(item: Item): string | null {
    if (PARTS.includes(item as Part) && hasPart(team, item as Part)) return copy.post.reason.owned;
    if (item === "flag" && team.has_flag) return copy.post.reason.owned;
    if (item === "sword" && team.has_sword) return copy.post.reason.owned;
    if (item === "shield" && team.shield_count >= 1) return copy.post.reason.shield;
    if (!open) return copy.post.reason.closed;
    if (locked) return copy.post.reason.raidLocked;
    const price = data.prices?.[item] ?? 0;
    if (PARTS.includes(item as Part) && (data.stock[item as Part] ?? 0) <= 0) return copy.post.reason.noStock;
    if (team.gold < price) return copy.post.reason.gold(price - team.gold);
    return null;
  }

  function startTimer() {
    if (busy || jobsFull || !open || locked) return;
    autoFailed.current = false;
    endsAt.current = Date.now() + timerSecs * 1000;
    setLeft(timerSecs);
  }

  const timing = left !== null && left > 0;
  const baseDisabled = busy || jobsFull || !open || locked;
  // Pass/Fail only while the challenge timer is running (timeout → auto Fail).
  const jobDisabled = baseDisabled || !timing;

  return (
    <Card className="border-4" style={{ borderColor: c.bg }}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-2xl font-extrabold" style={{ color: c.bg }}>
              {team.name}
            </div>
            <div className="text-sm text-muted-foreground">{copy.post.jobsHere(done, cfg.jobs_per_post)}</div>
            {locked && <div className="mt-1 text-sm font-semibold text-red-700">{copy.post.reason.raidLocked}</div>}
          </div>
          <div className="text-right">
            <div className="text-4xl font-black tabular-nums">{team.gold}</div>
            <div className="text-xs text-muted-foreground uppercase">{copy.team.gold}</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-1">
          {PARTS.map((p) => (
            <Badge key={p} variant={hasPart(team, p) ? "default" : "outline"}>
              {itemName(p)}
            </Badge>
          ))}
          {team.has_flag && <Badge variant="secondary">{copy.post.tagFlag(team.raids_left)}</Badge>}
          {team.has_sword && <Badge variant="secondary">{copy.post.tagSword}</Badge>}
          {team.shield_count > 0 && <Badge variant="secondary">{copy.post.tagShield}</Badge>}
        </div>

        {team.double_armed && (
          <div className="animate-pulse rounded-lg bg-yellow-300 py-2 text-center text-lg font-black text-yellow-950">
            {copy.post.doubleArmed}
          </div>
        )}

        {jobsFull ? (
          <div className="rounded-xl bg-slate-200 px-4 py-3 text-center">
            <div className="text-xl font-black">{copy.post.jobsUsed}</div>
            <div className="text-sm text-muted-foreground">{copy.post.jobsUsedHint(cfg.jobs_per_post)}</div>
          </div>
        ) : (
          <>
          <div className="flex flex-col gap-2">
            {timing ? (
              <div className="rounded-xl bg-slate-900 py-3 text-center text-5xl font-black tabular-nums text-white">
                {left}
              </div>
            ) : null}
            <Button
              variant="outline"
              disabled={baseDisabled}
              onClick={startTimer}
              className="h-14 text-lg font-bold"
            >
              <Timer className="size-5" />
              {timing ? copy.post.restartTimer(timerSecs) : copy.post.startTimer(timerSecs)}
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              disabled={jobDisabled}
              onClick={() => job(true)}
              className="h-20 bg-green-600 text-2xl font-black text-white hover:bg-green-700"
            >
              {jobDisabled && !timing ? copy.post.passReady : copy.post.pass(passAmount)}
            </Button>
            <Button
              disabled={jobDisabled}
              onClick={() => job(false)}
              className="h-20 bg-red-600 text-2xl font-black text-white hover:bg-red-700"
            >
              {jobDisabled && !timing ? copy.post.failReady : copy.post.fail(cfg.fail_pay)}
            </Button>
          </div>
          </>
        )}

        {forSale.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold text-muted-foreground uppercase">{copy.post.sell}</div>
            {forSale.map((item) => {
              const reason = reasonFor(item);
              const isPart = PARTS.includes(item as Part);
              return (
                <Button
                  key={item}
                  variant="outline"
                  disabled={busy || !!reason}
                  onClick={() =>
                    run("buy_item", { team_id: team.id, item }, (s) =>
                      toast.success(copy.post.toastBuy(team.name, itemName(item), Number(s.price))),
                    )
                  }
                  className="h-16 justify-between px-4 text-lg"
                >
                  <span className="flex flex-col items-start">
                    <span className="font-bold">{itemName(item)}</span>
                    {isPart && (
                      <span className="text-xs text-muted-foreground">
                        {copy.post.stock(data.stock[item as Part] ?? 0)}
                      </span>
                    )}
                  </span>
                  <span className="text-right">
                    <span className="block font-bold">{copy.post.buy(data.prices?.[item] ?? 0)}</span>
                    {reason && <span className="block text-xs text-red-600">{reason}</span>}
                  </span>
                </Button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
