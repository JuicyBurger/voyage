"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { RaidDice } from "@/components/team/raid-dice";
import { sendAction } from "@/lib/api";
import { teamColor } from "@/lib/colors";
import { clockText, copy, errorMessage } from "@/lib/copy";
import type { RaidResult, Team } from "@/lib/types";
import type { GameData } from "@/lib/use-game";
import { useNow } from "@/lib/use-now";

type RaidState = {
  result: RaidResult;
  defender: string;
  amount: number;
  attacker_die: number | null;
  attacker_bonus: number;
  defender_die: number | null;
  defender_bonus: number;
  doubled: boolean;
  pirate_hour: boolean;
  bounty: boolean;
  unlock_code?: string | null;
};

export function RaidSheet({
  data,
  team,
  open,
  onOpenChange,
  onDone,
  onUnlock,
}: {
  data: GameData;
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  onUnlock?: () => void;
}) {
  const [targetId, setTargetId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [raid, setRaid] = useState<RaidState | null>(null);

  const target = data.teams.find((t) => t.id === targetId) ?? null;
  const picking = !raid && !targetId;
  const now = useNow(picking ? 1000 : 0);
  const maxRaided = data.game.config.raid.max_times_raided;

  // Start fresh each time the sheet opens (not on close, so the closing sheet does not flash).
  useEffect(() => {
    if (!open) return;
    setTargetId(null);
    setCode("");
    setError(null);
    setRaid(null);
  }, [open]);

  async function go() {
    if (!target || code.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    const res = await sendAction<RaidState>("start_raid", { defender_id: target.id, code });
    setBusy(false);
    onDone();
    if (res.ok && res.state) setRaid(res.state);
    else {
      setError(errorMessage(res.error_code, res.args));
      setCode("");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-6">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">{copy.raid.title}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          {raid ? (
            <RaidDice
              attacker={{ name: copy.raid.you, color: team.color, die: raid.attacker_die, bonus: raid.attacker_bonus }}
              defender={{
                name: raid.defender,
                color: target?.color ?? "red",
                die: raid.defender_die,
                bonus: raid.defender_bonus,
              }}
              blocked={raid.result === "blocked"}
              good={raid.result === "win"}
            >
              <div className="text-2xl font-black">
                {raid.result === "win"
                  ? copy.raid.win(raid.amount)
                  : raid.result === "blocked"
                    ? copy.raid.blocked(raid.defender)
                    : copy.raid.loss}
              </div>
              <div className="mt-1 text-base font-semibold text-amber-700">
                {copy.raid.extras(raid.doubled, raid.pirate_hour, raid.bounty)}
              </div>
              {raid.result !== "win" && data.game.config.raid.immune_minutes > 0 && (
                <p className="mt-2 text-base font-semibold text-slate-700">
                  {copy.raid.safeAfter(data.game.config.raid.immune_minutes)}
                </p>
              )}
              {raid.result === "win" && (
                <p className="mt-3 text-base font-semibold text-slate-700">{copy.raid.unlockAfterWin}</p>
              )}
              {raid.result === "win" && onUnlock ? (
                <Button
                  className="mt-4 h-14 w-full text-lg font-bold text-white"
                  style={{ background: teamColor(team.color).bg }}
                  onClick={() => {
                    onOpenChange(false);
                    onUnlock();
                  }}
                >
                  {copy.raid.unlockTitle}
                </Button>
              ) : (
                <Button className="mt-4 h-14 w-full text-lg" onClick={() => onOpenChange(false)}>
                  {copy.raid.close}
                </Button>
              )}
            </RaidDice>
          ) : !target ? (
            <>
              <p className="text-base">{copy.raid.pickTarget}</p>
              <div className="grid grid-cols-2 gap-3">
                {data.teams
                  .filter((t) => t.id !== team.id && t.active !== false)
                  .map((t) => {
                    const c = teamColor(t.color);
                    const safeMs = t.immune_until ? Date.parse(t.immune_until) - now : 0;
                    const maxed = t.times_raided >= maxRaided;
                    const off = safeMs > 0 || maxed;
                    return (
                      <button
                        key={t.id}
                        disabled={off}
                        onClick={() => {
                          setTargetId(t.id);
                          setError(null);
                        }}
                        className="flex min-h-20 flex-col items-center justify-center rounded-xl px-2 text-lg font-bold text-white disabled:opacity-40"
                        style={{ background: c.bg }}
                      >
                        {t.name}
                        {safeMs > 0 && <span className="text-sm font-medium">{copy.raid.safe(clockText(safeMs / 1000))}</span>}
                        {maxed && <span className="text-sm font-medium">{copy.raid.maxed}</span>}
                      </button>
                    );
                  })}
              </div>
            </>
          ) : (
            <>
              <p className="text-base">{copy.raid.typeCode(target.name)}</p>
              <div className="flex justify-center">
                <InputOTP
                  maxLength={4}
                  value={code}
                  onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  pushPasswordManagerStrategy="none"
                  autoFocus
                >
                  <InputOTPGroup>
                    {[0, 1, 2, 3].map((i) => (
                      <InputOTPSlot key={i} index={i} className="size-16 text-3xl font-bold" />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              {error && <p className="text-center text-base font-semibold text-red-700">{error}</p>}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  className="h-14 text-lg"
                  onClick={() => {
                    setTargetId(null);
                    setCode("");
                    setError(null);
                  }}
                >
                  {copy.raid.back}
                </Button>
                <Button
                  className="h-14 text-lg font-bold text-white"
                  style={{ background: teamColor(team.color).bg }}
                  disabled={code.length !== 4 || busy}
                  onClick={go}
                >
                  {copy.raid.go}
                </Button>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
