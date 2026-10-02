"use client";

import { useState } from "react";
import { Trophy } from "lucide-react";
import { toast } from "sonner";
import { RevealView } from "@/components/game/reveal-view";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { sendAction } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";
import type { Game } from "@/lib/types";

// TV score switch and the final reveal buttons.
export function RevealControls({ game }: { game: Game }) {
  const [busy, setBusy] = useState(false);
  const total = Array.isArray(game.final_scores) ? game.final_scores.length : 0;
  const step = game.reveal_step;

  async function run(type: string, input: Record<string, unknown>) {
    setBusy(true);
    const res = await sendAction(type, input);
    setBusy(false);
    if (!res.ok) toast.error(errorMessage(res.error_code, res.args));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="size-5" /> {copy.reveal.mcTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
          <span className="text-sm font-medium">{copy.tv.showScores}</span>
          <Switch
            checked={game.show_scores_on_tv}
            onCheckedChange={(on) => void run("set_option", { name: "show_scores_on_tv", on })}
          />
        </div>

        {step === null ? (
          <>
            <p className="text-sm text-muted-foreground">{copy.reveal.mcHint}</p>
            <Button
              className="h-12 text-base"
              disabled={busy || game.status !== "ended"}
              onClick={() => confirm(copy.reveal.confirmStart) && run("reveal", { step: "start" })}
            >
              {copy.reveal.start}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{copy.reveal.shown(step, total)}</p>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="outline" className="h-12" disabled={busy || step === 0} onClick={() => run("reveal", { step: "back" })}>
                {copy.reveal.back}
              </Button>
              <Button
                className="col-span-2 h-12 bg-amber-500 text-base font-bold text-white hover:bg-amber-600"
                disabled={busy || step >= total}
                onClick={() => run("reveal", { step: "next" })}
              >
                {step >= total ? copy.reveal.done : copy.reveal.next(copy.scores.place(total - step))}
              </Button>
            </div>
            <div className="flex justify-center rounded-xl bg-slate-900 p-4 text-white">
              <RevealView game={game} />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
