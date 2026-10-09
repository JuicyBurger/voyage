"use client";

import { useState } from "react";
import { Flag, Shield, Sword } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { sendAction } from "@/lib/api";
import { formatClock } from "@/lib/clock";
import { teamColor } from "@/lib/colors";
import { copy, errorMessage, fieldName, itemName } from "@/lib/copy";
import { hasPart } from "@/lib/next-step";
import { PARTS, type Team } from "@/lib/types";
import type { GameData } from "@/lib/use-game";
import { useNow } from "@/lib/use-now";

export function TeamsTable({ data }: { data: GameData }) {
  const now = useNow(1000);
  const [editing, setEditing] = useState<Team | null>(null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.mc.teams}</CardTitle>
        <p className="text-sm text-muted-foreground">{copy.mc.tapToAdjust}</p>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.mc.col.team}</TableHead>
              <TableHead className="text-right">{copy.mc.col.gold}</TableHead>
              <TableHead>{copy.mc.col.parts}</TableHead>
              <TableHead>{copy.mc.col.items}</TableHead>
              <TableHead className="text-right">{copy.mc.col.raids}</TableHead>
              <TableHead className="text-right">{copy.mc.col.wins}</TableHead>
              <TableHead className="text-right">{copy.mc.col.defended}</TableHead>
              <TableHead className="text-right">{copy.mc.col.raided}</TableHead>
              <TableHead className="text-right">{copy.mc.col.stolen}</TableHead>
              <TableHead>{copy.mc.col.safe}</TableHead>
              <TableHead>{copy.mc.col.boat}</TableHead>
              <TableHead className="text-right">{copy.scores.points}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.teams.map((t) => {
              const c = teamColor(t.color);
              const safeMs = t.immune_until ? Date.parse(t.immune_until) - now : 0;
              const score = data.scores?.find((s) => s.team_id === t.id);
              const raids = data.raids ?? [];
              const defenceWins = raids.filter(
                (r) => r.defender_id === t.id && (r.result === "loss" || r.result === "blocked"),
              ).length;
              const goldStolen = raids
                .filter((r) => r.attacker_id === t.id && r.result === "win")
                .reduce((sum, r) => sum + (r.amount ?? 0), 0);
              return (
                <TableRow key={t.id} className="cursor-pointer text-base" onClick={() => setEditing(t)}>
                  <TableCell>
                    <span className="inline-flex items-center gap-2 font-semibold">
                      <span className="size-3 rounded-full" style={{ background: c.bg }} />
                      {t.name}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-mono text-lg font-bold tabular-nums">{t.gold}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {PARTS.map((p) => (
                        <span
                          key={p}
                          className="rounded px-1.5 py-0.5 text-xs font-semibold"
                          style={hasPart(t, p) ? { background: c.bg, color: "#fff" } : { border: "1px dashed #94a3b8", color: "#94a3b8" }}
                          title={hasPart(t, p) ? copy.post.reason.owned : "Belum"}
                        >
                          {itemName(p)}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1 text-slate-700">
                      {t.has_flag && <Flag className="size-4" />}
                      {t.has_sword && <Sword className="size-4" />}
                      {t.shield_count > 0 && <Shield className="size-4" />}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{t.has_flag ? t.raids_left : "–"}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.raid_wins}</TableCell>
                  <TableCell className="text-right tabular-nums">{defenceWins}</TableCell>
                  <TableCell className="text-right tabular-nums">{t.times_raided}</TableCell>
                  <TableCell className="text-right tabular-nums">{goldStolen || ""}</TableCell>
                  <TableCell className="font-mono tabular-nums">{safeMs > 0 ? formatClock(safeMs + 999) : ""}</TableCell>
                  <TableCell className="font-semibold">{t.boat_rank ? `#${t.boat_rank}` : ""}</TableCell>
                  <TableCell className="text-right">
                    {t.active === false ? (
                      <span className="text-xs text-muted-foreground">{copy.mc.parked}</span>
                    ) : (
                      score && (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono text-lg font-bold tabular-nums">
                            {score.total}{" "}
                            <span className="text-xs text-muted-foreground">({copy.scores.place(score.place)})</span>
                          </span>
                          <span className="max-w-48 text-right text-[10px] leading-tight text-muted-foreground">
                            {copy.mc.scoreHowBody(score)}
                          </span>
                        </div>
                      )
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      {editing && (
        <AdjustDialog
          team={data.teams.find((t) => t.id === editing.id) ?? editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  );
}

const TOGGLES = ["has_hull", "has_mast", "has_sail", "has_map", "has_flag", "has_sword", "shield_count"] as const;
const NUMBERS = ["raids_left", "raid_wins"] as const;

function toggleValue(team: Team, field: (typeof TOGGLES)[number]) {
  return field === "shield_count" ? team.shield_count > 0 : team[field];
}

// Each changed field is sent as its own mc_adjust call with the same reason.
function AdjustDialog({ team, onClose }: { team: Team; onClose: () => void }) {
  const [goldChange, setGoldChange] = useState("");
  const [toggles, setToggles] = useState(() => Object.fromEntries(TOGGLES.map((f) => [f, toggleValue(team, f)])));
  const [numbers, setNumbers] = useState(() => Object.fromEntries(NUMBERS.map((f) => [f, String(team[f])])));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const changes: { field: string; value: number }[] = [];
  const gold = parseInt(goldChange, 10);
  if (gold) changes.push({ field: "gold", value: gold });
  for (const f of TOGGLES) if (toggles[f] !== toggleValue(team, f)) changes.push({ field: f, value: toggles[f] ? 1 : 0 });
  for (const f of NUMBERS) {
    const n = parseInt(numbers[f], 10);
    if (!Number.isNaN(n) && n !== team[f]) changes.push({ field: f, value: n });
  }

  async function save() {
    setBusy(true);
    for (const ch of changes) {
      const res = await sendAction("mc_adjust", { team_id: team.id, ...ch, reason: reason.trim() });
      if (!res.ok) {
        toast.error(errorMessage(res.error_code, res.args));
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    toast.success(copy.mc.adjustTitle(team.name));
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{copy.mc.adjustTitle(team.name)}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="gold-change">
            {copy.mc.adjustGold} ({copy.mc.col.gold}: {team.gold})
          </Label>
          <div className="flex gap-2">
            {[-10, -5, 5, 10].map((d) => (
              <Button
                key={d}
                variant="outline"
                className="h-10 flex-1"
                onClick={() => setGoldChange(String((parseInt(goldChange, 10) || 0) + d))}
              >
                {d > 0 ? `+${d}` : d}
              </Button>
            ))}
          </div>
          <Input
            id="gold-change"
            inputMode="numeric"
            value={goldChange}
            onChange={(e) => setGoldChange(e.target.value.replace(/[^\d-]/g, ""))}
            placeholder="0"
            className="h-11 text-lg"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {TOGGLES.map((f) => (
            <label key={f} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm font-medium">
              {fieldName(f)}
              <Switch checked={toggles[f]} onCheckedChange={(on) => setToggles((s) => ({ ...s, [f]: on }))} />
            </label>
          ))}
          {NUMBERS.map((f) => (
            <label key={f} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm font-medium">
              {fieldName(f)}
              <Input
                inputMode="numeric"
                value={numbers[f]}
                onChange={(e) => setNumbers((s) => ({ ...s, [f]: e.target.value.replace(/\D/g, "") }))}
                className="h-9 w-16 text-right"
              />
            </label>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="reason">{copy.mc.reason}</Label>
          <Input
            id="reason"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder={copy.mc.reasonPlaceholder}
            className="h-11"
          />
        </div>

        <DialogFooter>
          <Button className="h-11 w-full" disabled={busy || !changes.length || !reason.trim()} onClick={save}>
            {copy.mc.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
