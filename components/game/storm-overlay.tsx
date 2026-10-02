"use client";

import { CloudLightning } from "lucide-react";
import { RehearsalMark } from "@/components/game/game-bar";
import { activeEvent, formatClock } from "@/lib/clock";
import { copy } from "@/lib/copy";
import type { Game, WorldEvent } from "@/lib/types";
import { useNow } from "@/lib/use-now";

// Covers the whole screen while a Storm is on, with a countdown.
export function StormOverlay({ game, events }: { game: Game; events: WorldEvent[] }) {
  const now = useNow();
  const timerNow = game.paused_at ? Date.parse(game.paused_at) : now;
  const storm = game.status === "ended" ? undefined : activeEvent(events, "storm", timerNow);
  if (!storm) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center bg-slate-800/95 text-white">
      {game.rehearsal && <RehearsalMark />}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        <CloudLightning className="size-28 animate-pulse text-yellow-300" />
        <h2 className="text-6xl font-black">{copy.storm.title}</h2>
        <p className="max-w-md text-2xl font-semibold">{copy.storm.body}</p>
        <div className="font-mono text-5xl font-bold tabular-nums">
          {copy.storm.wait(formatClock(Date.parse(storm.ends_at!) - timerNow + 999))}
        </div>
      </div>
    </div>
  );
}
