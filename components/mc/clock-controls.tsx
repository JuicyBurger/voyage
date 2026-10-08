"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendAction } from "@/lib/api";
import { eventMs } from "@/lib/clock";
import { copy, errorMessage } from "@/lib/copy";
import type { Game } from "@/lib/types";
import { useNow } from "@/lib/use-now";

// Start / Pause / Resume / Last Call / End, depending on the game state.
export function ClockControls({ game, onDone }: { game: Game; onDone?: () => void }) {
  const now = useNow();
  const minuteNow = eventMs(game, now) / 60000;
  const timeToEnd = game.status === "last_call" && minuteNow >= 41;
  const [busy, setBusy] = useState(false);

  async function control(action: string) {
    if (action === "end" && !confirm(copy.mc.confirmEnd)) return;
    setBusy(true);
    const res = await sendAction("game_control", { action });
    setBusy(false);
    if (!res.ok) toast.error(errorMessage(res.error_code, res.args));
    else onDone?.();
  }

  const btn = (action: string, label: string, className = "") => (
    <Button key={action} disabled={busy} onClick={() => control(action)} className={`h-12 px-5 text-base ${className}`}>
      {label}
    </Button>
  );

  const paused = !!game.paused_at;
  const buttons = [];
  if (game.status === "setup") buttons.push(btn("ready", copy.mc.ready));
  if (game.status === "ready") {
    buttons.push(btn("start", copy.mc.start, "bg-green-600 text-white hover:bg-green-700"));
    buttons.push(btn("unready", copy.mc.unready, "bg-secondary text-secondary-foreground"));
  }
  if (game.status === "running" || game.status === "last_call") {
    buttons.push(paused ? btn("resume", copy.mc.resume, "bg-green-600 text-white") : btn("pause", copy.mc.pause));
    if (game.status === "running") buttons.push(btn("last_call", copy.mc.lastCall, "bg-amber-500 text-white"));
    buttons.push(
      btn(
        "end",
        copy.mc.end,
        `bg-red-600 text-white hover:bg-red-700${timeToEnd ? " animate-pulse" : ""}`,
      ),
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {buttons}
      {timeToEnd && <span className="text-sm font-bold text-red-700">{copy.mc.timeToEnd}</span>}
    </div>
  );
}
