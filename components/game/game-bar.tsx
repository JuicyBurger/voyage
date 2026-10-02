"use client";

import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { activeEvents, eventMs, formatClock } from "@/lib/clock";
import { copy, priceDialText, stripText } from "@/lib/copy";
import type { Game, WorldEvent } from "@/lib/types";
import { useNow } from "@/lib/use-now";

const STRIP_BG: Record<string, string> = {
  gold_rush: "#ca8a04",
  storm: "#475569",
  market_sale: "#15803d",
  pirate_hour: "#7f1d1d",
  bounty: "#9a3412",
};

// Top bar for every screen: name, event clock, game state, reconnect badge,
// and one strip per running event with its countdown.
export function GameBar({
  game,
  events = [],
  title,
  icon,
  accent,
  connected,
  subtitle,
}: {
  game: Game;
  events?: WorldEvent[];
  title: string;
  icon?: ReactNode;
  accent?: string;
  connected: boolean;
  subtitle?: string;
}) {
  const now = useNow();
  const paused = !!game.paused_at;
  const status = paused ? copy.status.paused : copy.status[game.status];
  // While paused, timers stand still at the moment of the pause.
  const timerNow = game.paused_at ? Date.parse(game.paused_at) : now;
  const running = game.status === "ended" ? [] : activeEvents(events, timerNow);

  return (
    <header className="sticky top-0 z-30 text-white shadow-md" style={{ background: accent ?? "#0f172a" }}>
      {game.rehearsal && <RehearsalMark />}
      <div className="flex items-center gap-3 px-4 py-2">
        {icon}
        <div className="min-w-0 flex-1">
          <div className="truncate text-xl leading-tight font-extrabold">{title}</div>
          {subtitle && <div className="truncate text-xs opacity-80">{subtitle}</div>}
        </div>
        <div className="text-right">
          <div className="font-mono text-2xl leading-none font-bold tabular-nums">{formatClock(eventMs(game, now))}</div>
          <div className={`text-xs font-semibold uppercase ${paused ? "animate-pulse" : "opacity-80"}`}>{status}</div>
        </div>
      </div>
      {!connected && (
        <div className="flex items-center justify-center gap-2 bg-amber-400 py-1 text-sm font-semibold text-amber-950">
          <WifiOff className="size-4" /> Reconnecting…
        </div>
      )}
      {paused && game.status !== "ended" && (
        <div className="bg-red-600 py-1 text-center text-sm font-bold tracking-wide">PAUSED. Please wait.</div>
      )}
      {running.map((e) => (
        <div
          key={e.id}
          className="flex items-center justify-between gap-2 px-4 py-1 text-sm font-semibold"
          style={{ background: STRIP_BG[e.kind] ?? "#334155" }}
        >
          <span className="truncate">{stripText(e)}</span>
          <span className="font-mono tabular-nums">{formatClock(Date.parse(e.ends_at!) - timerNow + 999)}</span>
        </div>
      ))}
      {game.price_dial_percent !== null && game.status !== "ended" && (
        <div className="bg-indigo-700 px-4 py-1 text-sm font-semibold">{priceDialText(game.price_dial_percent)}</div>
      )}
    </header>
  );
}

export function RehearsalMark() {
  return (
    <div className="bg-fuchsia-600 py-1 text-center text-xs font-black tracking-widest text-white">
      {copy.rehearsal.badge}
    </div>
  );
}
