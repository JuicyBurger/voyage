"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatClock } from "@/lib/clock";
import { teamColor } from "@/lib/colors";
import { copy, feedLine } from "@/lib/copy";
import type { GameData } from "@/lib/use-game";

// The latest actions from every post and team.
export function ActivityFeed({ data }: { data: GameData }) {
  const lines = data.actions.flatMap((a) => {
    const team = data.teams.find((t) => t.id === a.team_id);
    const text = feedLine(a, team?.name ?? "?");
    return text ? [{ a, team, text }] : [];
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.mc.feed}</CardTitle>
      </CardHeader>
      <CardContent className="flex max-h-[28rem] flex-col gap-1.5 overflow-y-auto">
        {lines.length === 0 && <p className="text-muted-foreground">{copy.mc.noFeed}</p>}
        {lines.map(({ a, team, text }) => (
          <div key={a.id} className={`flex gap-3 text-sm ${a.undone_at ? "line-through opacity-50" : ""}`}>
            <span className="w-12 shrink-0 font-mono text-muted-foreground tabular-nums">
              {formatClock(a.details.minute_ms ?? 0)}
            </span>
            <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: team ? teamColor(team.color).bg : "#94a3b8" }} />
            <span>{text}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
