"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { sendAction } from "@/lib/api";
import { teamColor } from "@/lib/colors";
import { copy, errorMessage } from "@/lib/copy";
import type { Team } from "@/lib/types";
import type { GameData } from "@/lib/use-game";

export function UnlockSheet({
  data,
  team,
  open,
  onOpenChange,
  onDone,
  initialCode = "",
}: {
  data: GameData;
  team: Team;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  initialCode?: string;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prisoners = data.teams.filter((t) => t.raid_locked_by === team.id);

  useEffect(() => {
    if (!open) return;
    setCode(initialCode);
    setError(null);
  }, [open, initialCode]);

  async function go() {
    if (code.length !== 4 || busy) return;
    setBusy(true);
    setError(null);
    const res = await sendAction("unlock_raid_victim", { code });
    setBusy(false);
    onDone();
    if (res.ok) {
      toast.success(copy.raid.unlockOk(String(res.state?.team ?? "")));
      onOpenChange(false);
    } else {
      setError(errorMessage(res.error_code, res.args));
      setCode("");
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl pb-6">
        <SheetHeader>
          <SheetTitle className="text-xl font-bold">{copy.raid.unlockTitle}</SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          <p className="text-base">{copy.raid.unlockHint}</p>
          {prisoners.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {prisoners.map((t) => {
                const c = teamColor(t.color);
                return (
                  <li
                    key={t.id}
                    className="rounded-lg px-3 py-1 text-sm font-bold text-white"
                    style={{ background: c.bg }}
                  >
                    {t.name}
                  </li>
                );
              })}
            </ul>
          )}
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
          <Button
            className="h-14 text-lg font-bold text-white"
            style={{ background: teamColor(team.color).bg }}
            disabled={code.length !== 4 || busy}
            onClick={go}
          >
            {copy.raid.unlockGo}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
