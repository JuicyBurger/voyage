"use client";

import { useEffect, useState } from "react";
import { Sailboat } from "lucide-react";
import { EventBanner } from "@/components/game/event-banner";
import { GameBar } from "@/components/game/game-bar";
import { RevealView } from "@/components/game/reveal-view";
import { StormOverlay } from "@/components/game/storm-overlay";
import { eventMs, formatClock } from "@/lib/clock";
import { teamColor } from "@/lib/colors";
import { copy, feedLine } from "@/lib/copy";
import { ensureTvPass } from "@/lib/read-pass";
import type { GameData } from "@/lib/use-game";
import { useGame } from "@/lib/use-game";
import { useNow } from "@/lib/use-now";
import { useWakeLock } from "@/lib/use-wake-lock";

// Read-only board for a TV or projector. No role token; never shows raid codes.
export function TvScreen({ code }: { code: string }) {
  const [gameId, setGameId] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  useWakeLock();

  useEffect(() => {
    let cancelled = false;
    void ensureTvPass(code).then((res) => {
      if (cancelled) return;
      if (res.ok && res.game_id) setGameId(res.game_id);
      else setMissing(true);
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const { data, connected } = useGame(gameId, "all", 12);

  if (missing) return <Shell>{copy.tv.notFound}</Shell>;
  if (!data) return <Shell>{copy.common.loading}</Shell>;

  if (data.game.reveal_step !== null) {
    return (
      <main className="flex min-h-dvh justify-center bg-slate-900 p-10 text-white">
        <RevealView game={data.game} big />
      </main>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-slate-900 text-white">
      <GameBar game={data.game} events={data.events} title={copy.appName} icon={<Sailboat className="size-8" />} connected={connected} />
      <EventBanner events={data.events} />
      <StormOverlay game={data.game} events={data.events} />
      <main className="grid flex-1 gap-6 p-8 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <BigClock data={data} />
          <Boats data={data} />
          <Scores data={data} />
        </div>
        <Feed data={data} />
      </main>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-slate-900 p-6 text-3xl font-bold text-white">{children}</main>
  );
}

function BigClock({ data }: { data: GameData }) {
  const now = useNow();
  const status = data.game.paused_at ? copy.status.paused : copy.status[data.game.status];
  return (
    <div className="text-center">
      <div className="font-mono text-[9rem] leading-none font-black tabular-nums">{formatClock(eventMs(data.game, now))}</div>
      <div className="text-3xl font-bold uppercase opacity-80">{status}</div>
    </div>
  );
}

function Boats({ data }: { data: GameData }) {
  const done = data.teams.filter((t) => t.boat_rank).sort((a, b) => a.boat_rank! - b.boat_rank!);
  return (
    <section className="rounded-2xl bg-white/10 p-5">
      <h2 className="mb-3 text-2xl font-bold">{copy.tv.boats}</h2>
      {done.length === 0 && <p className="text-xl opacity-70">{copy.tv.noBoats}</p>}
      <div className="flex flex-wrap gap-3">
        {done.map((t) => (
          <div key={t.id} className="flex items-center gap-3 rounded-xl px-5 py-3 text-2xl font-extrabold" style={{ background: teamColor(t.color).bg }}>
            <Sailboat className="size-7" /> #{t.boat_rank} {t.name}
          </div>
        ))}
      </div>
    </section>
  );
}

function Scores({ data }: { data: GameData }) {
  if (!data.game.show_scores_on_tv) {
    return <section className="rounded-2xl bg-white/10 p-5 text-center text-2xl font-semibold opacity-80">{copy.tv.scoresHidden}</section>;
  }
  return (
    <section className="rounded-2xl bg-white/10 p-5">
      <h2 className="mb-3 text-2xl font-bold">{copy.tv.scores}</h2>
      <div className="flex flex-col gap-2">
        {(data.scores ?? []).map((s) => (
          <div key={s.team_id} className="flex items-center gap-4 rounded-xl px-4 py-2" style={{ background: teamColor(s.color).bg }}>
            <span className="w-14 text-2xl font-black">{copy.scores.place(s.place)}</span>
            <span className="flex-1 text-2xl font-bold">{s.name}</span>
            <span className="text-3xl font-black tabular-nums">{s.total}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Feed({ data }: { data: GameData }) {
  const lines = data.actions.flatMap((a) => {
    const team = data.teams.find((t) => t.id === a.team_id);
    const text = team ? feedLine(a, team.name) : null;
    return text && !a.undone_at ? [{ id: a.id, text, color: teamColor(team!.color).bg, ms: a.details.minute_ms ?? 0 }] : [];
  });
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white/10 p-5 lg:col-span-2">
      <h2 className="text-2xl font-bold">{copy.tv.feed}</h2>
      {lines.map((l) => (
        <div key={l.id} className="flex items-start gap-3 text-xl">
          <span className="w-16 shrink-0 font-mono opacity-60 tabular-nums">{formatClock(l.ms)}</span>
          <span className="mt-2 size-3 shrink-0 rounded-full" style={{ background: l.color }} />
          <span>{l.text}</span>
        </div>
      ))}
    </section>
  );
}

