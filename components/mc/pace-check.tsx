"use client";

import { Gauge } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { eventMs } from "@/lib/clock";
import { copy } from "@/lib/copy";
import { hasPart } from "@/lib/next-step";
import { PARTS } from "@/lib/types";
import type { GameData } from "@/lib/use-game";
import { useNow } from "@/lib/use-now";

// Compares parts bought by all teams with the config numbers at minutes 20 and 25.
export function PaceCheck({ data }: { data: GameData }) {
  const now = useNow(1000);
  const minute = eventMs(data.game, now) / 60000;
  const parts = data.teams.reduce((sum, t) => sum + PARTS.filter((p) => hasPart(t, p)).length, 0);

  // The latest checkpoint the clock has passed.
  const checkpoints = Object.keys(data.game.config.pace_check).sort((a, b) => Number(a) - Number(b));
  const passed = checkpoints.filter((m) => minute >= Number(m)).pop();
  const point = passed ? data.game.config.pace_check[passed] : null;

  let verdict = copy.mc.paceWait;
  let tone = "bg-muted";
  if (point) {
    if (parts <= point.slow_at_or_below) {
      verdict = copy.mc.paceSlow;
      tone = "bg-amber-100 text-amber-900";
    } else if (parts >= point.fast_at_or_above) {
      verdict = copy.mc.paceFast;
      tone = "bg-sky-100 text-sky-900";
    } else {
      verdict = copy.mc.paceOn;
      tone = "bg-green-100 text-green-900";
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gauge className="size-5" /> {copy.mc.pace}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="text-base">{copy.mc.paceParts(parts)}</div>
        {point && passed && <div className="text-sm text-muted-foreground">{copy.mc.paceAt(passed, point.normal)}</div>}
        <div className={`rounded-lg p-3 text-base font-semibold ${tone}`}>{verdict}</div>
      </CardContent>
    </Card>
  );
}
