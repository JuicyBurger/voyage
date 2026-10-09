"use client";

import { useState } from "react";
import { Check, Flag, Lock, Shield, ShieldCheck, Sword, Swords, Zap } from "lucide-react";
import { toast } from "sonner";
import { EventBanner } from "@/components/game/event-banner";
import { GameBar } from "@/components/game/game-bar";
import { RevealOverlay } from "@/components/game/reveal-view";
import { StormOverlay } from "@/components/game/storm-overlay";
import { IncomingRaid } from "@/components/team/incoming-raid";
import { RaidCodeCard } from "@/components/team/raid-code-card";
import { RaidLockOverlay } from "@/components/team/raid-lock-overlay";
import { RejoinCodeCard } from "@/components/game/rejoin-code-card";
import { RaidSheet } from "@/components/team/raid-sheet";
import { UnlockSheet } from "@/components/team/unlock-sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendAction } from "@/lib/api";
import { formatClock } from "@/lib/clock";
import { teamColor } from "@/lib/colors";
import { clockText, copy, errorMessage, itemName, journeyLine } from "@/lib/copy";
import { useNow } from "@/lib/use-now";
import { hasPart, nextStep } from "@/lib/next-step";
import { POST_ICONS } from "@/lib/post-icons";
import { PARTS, type Identity, type Team } from "@/lib/types";
import { useGame, type GameData } from "@/lib/use-game";

export function TeamScreen({ identity }: { identity: Identity }) {
  const teamId = identity.team_id!;
  const { data, connected, refresh } = useGame(identity.game_id, { column: "team_id", value: teamId }, 50);
  const now = useNow(1000);
  const [raidOpen, setRaidOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);

  if (!data) return <main className="p-6 text-lg">{copy.common.loading}</main>;

  const team = data.teams.find((t) => t.id === teamId)!;
  const c = teamColor(team.color);
  const safeMs = team.immune_until ? Date.parse(team.immune_until) - now : 0;
  const servingPost = data.posts.find((p) => p.serving_team_id === team.id);
  const challenge = servingPost ? data.game.config.post_rules?.[servingPost.kind] : null;
  const hasPrisoners = data.teams.some((t) => t.raid_locked_by === team.id);

  return (
    <div className="flex min-h-dvh flex-col" style={{ background: c.soft }}>
      <GameBar game={data.game} events={data.events} title={team.name} accent={c.bg} connected={connected} />
      <EventBanner events={data.events} />
      <StormOverlay game={data.game} events={data.events} />
      <RaidLockOverlay game={data.game} me={team} teams={data.teams} />
      <RevealOverlay game={data.game} me={team.id} scores={data.scores} />
      <IncomingRaid raids={data.raids} teams={data.teams} me={team} />

      <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-3 pb-10">
        <section className="py-2 text-center">
          <div className="text-8xl leading-none font-black tabular-nums" style={{ color: c.bg }}>
            {team.gold}
          </div>
          <div className="text-lg font-semibold uppercase">{copy.team.gold}</div>
        </section>

        {safeMs > 0 && (
          <div className="flex items-center gap-2 rounded-xl bg-sky-100 px-4 py-3 text-base font-semibold text-sky-900">
            <ShieldCheck className="size-5 shrink-0" />
            {copy.team.safeFor(clockText(safeMs / 1000))}
          </div>
        )}

        <Card className="border-2" style={{ borderColor: c.bg }}>
          <CardContent className="flex items-start gap-3">
            <Zap className="mt-0.5 size-6 shrink-0" style={{ color: c.bg }} />
            <div>
              <div className="text-xs font-semibold text-muted-foreground uppercase">{copy.team.nextStep}</div>
              <div className="text-lg leading-snug font-semibold">{nextStep(data, team)}</div>
            </div>
          </CardContent>
        </Card>

        {servingPost && challenge && (
          <Card className="border-2 border-amber-400 bg-amber-50">
            <CardHeader>
              <CardTitle className="text-lg">{copy.team.challengeTitle(servingPost.name)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base leading-snug">{challenge}</p>
            </CardContent>
          </Card>
        )}

        <BoatCard data={data} team={team} accent={c.bg} />
        <ItemsCard data={data} team={team} accent={c.bg} onChange={refresh} />

        {team.has_flag && team.raids_left > 0 && (
          <button
            onClick={() => setRaidOpen(true)}
            className="flex min-h-16 items-center justify-center gap-3 rounded-xl text-2xl font-black text-white shadow-md active:scale-[0.98]"
            style={{ background: c.bg }}
          >
            <Swords className="size-7" /> {copy.raid.button(team.raids_left)}
          </button>
        )}
        {hasPrisoners && (
          <button
            onClick={() => setUnlockOpen(true)}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-red-700 bg-red-50 text-xl font-black text-red-800 active:scale-[0.98]"
          >
            <Lock className="size-6" /> {copy.raid.unlockTitle}
          </button>
        )}
        <RaidSheet
          data={data}
          team={team}
          open={raidOpen}
          onOpenChange={setRaidOpen}
          onDone={refresh}
          onUnlock={() => setUnlockOpen(true)}
        />
        <UnlockSheet data={data} team={team} open={unlockOpen} onOpenChange={setUnlockOpen} onDone={refresh} />

        <RaidCodeCard team={team} accent={c.bg} />
        <RejoinCodeCard accent={c.bg} />
        <PostsCard data={data} team={team} />
        <JourneyCard data={data} />
      </main>
    </div>
  );
}

function BoatCard({ data, team, accent }: { data: GameData; team: Team; accent: string }) {
  const cfg = data.game.config;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.team.boat}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {PARTS.map((p) => {
          const owned = hasPart(team, p);
          const post = data.posts.find((x) => x.kind === cfg.parts[p].post);
          return (
            <div
              key={p}
              className="flex min-h-20 flex-col justify-center rounded-xl border-2 p-3"
              style={owned ? { background: accent, borderColor: accent, color: "#fff" } : { borderStyle: "dashed" }}
            >
              <div className="flex items-center gap-1 text-lg font-bold">
                {owned && <Check className="size-5" />} {itemName(p)}
              </div>
              {owned ? (
                <div className="text-sm opacity-90">{copy.team.owned}</div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {copy.team.partWhere(data.prices?.[p] ?? cfg.parts[p].price, post?.name ?? "?")}
                  {post && post.active === false && <span className="text-red-700"> ({copy.team.postOff})</span>}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ItemsCard({
  data,
  team,
  accent,
  onChange,
}: {
  data: GameData;
  team: Team;
  accent: string;
  onChange: () => void;
}) {
  const cfg = data.game.config;
  const smith = data.posts.find((p) => p.kind === "blacksmith");
  const [busy, setBusy] = useState(false);

  async function toggleDouble() {
    if (busy || team.double_used) return;
    setBusy(true);
    const res = await sendAction("arm_double", { on: !team.double_armed });
    setBusy(false);
    if (!res.ok) toast.error(errorMessage(res.error_code, res.args));
    onChange();
  }

  // Owned: what it does now. Not owned: what it does, price and where to buy it.
  const row = (on: boolean, icon: React.ReactNode, text: string, item: "flag" | "sword" | "shield", help: string) => (
    <div className={`flex items-start gap-3 text-base ${on ? "font-semibold" : "text-muted-foreground"}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div>{text}</div>
        {!on && (
          <div className="text-sm font-normal">
            {help} {copy.team.itemWhere(data.prices?.[item] ?? cfg.items[item].price, smith?.name ?? "?")}
            {smith && smith.active === false && <span className="text-red-700"> ({copy.team.postOff})</span>}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.team.items}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {row(
          team.has_flag,
          <Flag className="size-5" />,
          team.has_flag ? copy.team.flag(team.raids_left) : copy.team.noFlag,
          "flag",
          copy.team.itemHelp.flag(cfg.items.flag.raids),
        )}
        {row(
          team.has_sword,
          <Sword className="size-5" />,
          team.has_sword ? copy.team.sword(cfg.items.sword.bonus) : copy.team.noSword,
          "sword",
          copy.team.itemHelp.sword(cfg.items.sword.bonus),
        )}
        {row(
          team.shield_count > 0,
          <Shield className="size-5" />,
          team.shield_count > 0 ? copy.team.shield : copy.team.noShield,
          "shield",
          copy.team.itemHelp.shield,
        )}

        <button
          onClick={toggleDouble}
          disabled={busy || team.double_used}
          className="mt-1 min-h-16 rounded-xl border-4 px-4 py-3 text-left text-base font-bold transition-colors disabled:opacity-60"
          style={
            team.double_armed
              ? { background: "#fde047", borderColor: "#ca8a04", color: "#422006" }
              : { borderColor: accent }
          }
        >
          <div className="text-xs uppercase opacity-70">{copy.team.doubleTitle}</div>
          {team.double_used ? copy.team.doubleUsed : team.double_armed ? copy.team.doubleOn : copy.team.doubleOff}
        </button>
      </CardContent>
    </Card>
  );
}

function PostsCard({ data, team }: { data: GameData; team: Team }) {
  const total = data.game.config.jobs_per_post;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.team.posts}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {data.posts
          .filter((p) => p.active !== false)
          .map((p) => {
            const Icon = POST_ICONS[p.kind];
            const done = data.jobCounts.find((j) => j.team_id === team.id && j.post_id === p.id)?.count ?? 0;
            const status =
              p.serving_team_id === team.id ? copy.team.servingYou : p.serving_team_id ? copy.team.busy : copy.team.free;
            return (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <Icon className="size-6 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{p.name}</div>
                  <div className="text-sm text-muted-foreground">{copy.team.jobsLeft(total - done, total)}</div>
                </div>
                <div className="text-right text-sm">
                  <div className={p.serving_team_id && p.serving_team_id !== team.id ? "text-amber-700" : "text-green-700"}>
                    {status}
                  </div>
                  {p.waiting_count > 0 && <div className="text-muted-foreground">{copy.team.waiting(p.waiting_count)}</div>}
                </div>
              </div>
            );
          })}
      </CardContent>
    </Card>
  );
}

function JourneyCard({ data }: { data: GameData }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.team.journey}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {data.actions.length === 0 && <p className="text-muted-foreground">{copy.team.noJourney}</p>}
        {data.actions.map((a) => (
          <div key={a.id} className={`flex gap-3 text-sm ${a.undone_at ? "line-through opacity-50" : ""}`}>
            <span className="w-12 shrink-0 font-mono text-muted-foreground tabular-nums">
              {formatClock(a.details.minute_ms ?? 0)}
            </span>
            <span>{journeyLine(a)}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
