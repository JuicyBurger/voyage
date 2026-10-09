"use client";

import { Lock } from "lucide-react";
import { RehearsalMark } from "@/components/game/game-bar";
import { copy } from "@/lib/copy";
import type { Game, Team } from "@/lib/types";

// Full-screen lock after a successful raid seize (immediate, or after post Selesai).
// Cleared when the attacking team enters the OTP on their phone.
export function RaidLockOverlay({ game, me, teams }: { game: Game; me: Team; teams: Team[] }) {
  if (!me.raid_locked_by || !me.raid_unlock_code) return null;
  if (game.status === "ended") return null;

  const attacker = teams.find((t) => t.id === me.raid_locked_by);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center bg-red-950/95 text-white">
      {game.rehearsal && <RehearsalMark />}
      <div className="flex flex-1 flex-col items-center justify-center gap-5 p-8 text-center">
        <Lock className="size-24 animate-pulse text-red-300" />
        <h2 className="text-5xl font-black">{copy.raid.lockTitle}</h2>
        <p className="max-w-md text-xl font-semibold">
          {copy.raid.lockBody(attacker?.name ?? "?")}
        </p>
        <div className="rounded-2xl bg-white px-8 py-4 font-mono text-6xl font-black tracking-[0.3em] text-red-950 tabular-nums">
          {me.raid_unlock_code}
        </div>
        <p className="max-w-sm text-base opacity-90">{copy.raid.lockHint}</p>
      </div>
    </div>
  );
}
