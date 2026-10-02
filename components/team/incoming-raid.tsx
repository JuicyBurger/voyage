"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { RaidDice } from "@/components/team/raid-dice";
import { copy } from "@/lib/copy";
import { serverNow } from "@/lib/server-time";
import type { Raid, Team } from "@/lib/types";

const MAX_AGE_MS = 15000;

// When another crew raids this team, show the same dice on the defender's phone.
export function IncomingRaid({ raids, teams, me }: { raids: Raid[]; teams: Team[]; me: Team }) {
  const seen = useRef<Set<string> | null>(null);
  const [raid, setRaid] = useState<Raid | null>(null);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(raids.map((r) => r.id));
      return;
    }
    const recent = serverNow() - MAX_AGE_MS;
    const fresh = raids.find(
      (r) => r.defender_id === me.id && !seen.current!.has(r.id) && Date.parse(r.created_at) > recent,
    );
    for (const r of raids) seen.current.add(r.id);
    if (fresh) setRaid(fresh);
  }, [raids, me.id]);

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
          <Button className="mt-4 h-14 w-full text-lg" onClick={() => setRaid(null)}>
            {copy.raid.close}
          </Button>
        </RaidDice>
      </DialogContent>
    </Dialog>
  );
}
