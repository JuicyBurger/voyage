"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { RaidDice } from "@/components/team/raid-dice";
import { copy } from "@/lib/copy";
import { serverNow } from "@/lib/server-time";
import type { Raid, Team } from "@/lib/types";

const MAX_AGE_MS = 15000;
const AUTO_DISMISS_MS = 8000;

// When another crew raids this team, show the same dice on the defender's phone.
export function IncomingRaid({
  raids,
  teams,
  me,
  immuneMinutes,
}: {
  raids: Raid[];
  teams: Team[];
  me: Team;
  immuneMinutes?: number;
}) {
  const seen = useRef<Set<string> | null>(null);
  const [raid, setRaid] = useState<Raid | null>(null);
  const [queue, setQueue] = useState<Raid[]>([]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(raids.map((r) => r.id));
      return;
    }
    const recent = serverNow() - MAX_AGE_MS;
    const fresh = raids
      .filter((r) => r.defender_id === me.id && !seen.current!.has(r.id) && Date.parse(r.created_at) > recent)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    for (const r of raids) seen.current.add(r.id);
    if (fresh.length) setQueue((q) => [...q, ...fresh]);
  }, [raids, me.id]);

  useEffect(() => {
    if (raid || !queue.length) return;
    setRaid(queue[0]);
    setQueue((q) => q.slice(1));
  }, [raid, queue]);

  // Auto-dismiss so a stuck result cannot block the phone over event banners.
  useEffect(() => {
    if (!raid) return;
    const id = window.setTimeout(() => setRaid(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(id);
  }, [raid]);

  if (!raid) return null;
  const attacker = teams.find((t) => t.id === raid.attacker_id);
  const name = attacker?.name ?? "?";

  return (
    <Dialog open onOpenChange={(open) => !open && setRaid(null)}>
      <DialogContent showCloseButton={false} className="gap-5 p-6">
        <DialogTitle className="text-center text-3xl font-black text-red-700">{copy.raid.raidedTitle}</DialogTitle>
        <RaidDice
          key={raid.id}
          attacker={{ name, color: attacker?.color ?? "red", die: raid.attacker_die, bonus: raid.attacker_bonus }}
          defender={{ name: copy.raid.you, color: me.color, die: raid.defender_die, bonus: raid.defender_bonus }}
          blocked={raid.result === "blocked"}
          good={raid.result !== "win"}
        >
          <div className="text-2xl font-black">
            {raid.result === "win"
              ? copy.raid.defLoss(name, raid.amount)
              : raid.result === "blocked"
                ? copy.raid.defBlocked(name)
                : copy.raid.defWin(name)}
          </div>
          {immuneMinutes != null && immuneMinutes > 0 && (
            <p className="mt-2 text-base font-semibold text-slate-700">{copy.raid.safeAfter(immuneMinutes)}</p>
          )}
          <Button className="mt-4 h-14 w-full text-lg" onClick={() => setRaid(null)}>
            {copy.raid.close}
          </Button>
        </RaidDice>
      </DialogContent>
    </Dialog>
  );
}
