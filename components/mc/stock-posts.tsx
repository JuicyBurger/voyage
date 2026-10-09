"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { teamColor } from "@/lib/colors";
import { copy, itemName } from "@/lib/copy";
import { POST_ICONS } from "@/lib/post-icons";
import { PARTS } from "@/lib/types";
import type { GameData } from "@/lib/use-game";

export function StockPosts({ data }: { data: GameData }) {
  const limit = data.game.config.jobs_per_post;
  const jobs = (teamId: string, postId: string) =>
    data.jobCounts.find((j) => j.team_id === teamId && j.post_id === postId)?.count ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.mc.stockAndPosts}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="mb-1 text-sm font-semibold text-muted-foreground">{copy.mc.stock}</div>
          <div className="grid grid-cols-4 gap-2">
            {PARTS.map((p) => (
              <div key={p} className="rounded-lg border p-2 text-center">
                <div className="text-sm">{itemName(p)}</div>
                <div className={`text-2xl font-bold tabular-nums ${data.stock[p] === 0 ? "text-red-600" : ""}`}>
                  {data.stock[p]}
                </div>
                <div className="text-xs text-muted-foreground">{data.prices?.[p]} emas</div>
              </div>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <div className="mb-1 text-sm font-semibold text-muted-foreground">{copy.mc.jobs}</div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                {data.teams
                  .filter((t) => t.active !== false)
                  .map((t) => (
                    <TableHead key={t.id} className="text-center">
                      <span className="font-semibold" style={{ color: teamColor(t.color).bg }}>
                        {t.name}
                      </span>
                    </TableHead>
                  ))}
                <TableHead>{copy.mc.serving}</TableHead>
                <TableHead className="text-right">{copy.mc.waiting}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.posts
                .filter((p) => p.active !== false)
                .map((p) => {
                const Icon = POST_ICONS[p.kind];
                const serving = data.teams.find((t) => t.id === p.serving_team_id);
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <Icon className="size-4" /> {p.name}
                      </span>
                    </TableCell>
                    {data.teams
                      .filter((t) => t.active !== false)
                      .map((t) => {
                        const n = jobs(t.id, p.id);
                        return (
                          <TableCell
                            key={t.id}
                            className={`text-center tabular-nums ${n >= limit ? "font-bold text-red-600" : ""}`}
                          >
                            {n}/{limit}
                          </TableCell>
                        );
                      })}
                    <TableCell>{serving?.name ?? "–"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.waiting_count}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
