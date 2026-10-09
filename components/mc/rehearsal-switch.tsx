"use client";

import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { sendAction } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";
import type { Game } from "@/lib/types";

// On before Start: the event clock runs 4× faster on every screen.
export function RehearsalSwitch({ game }: { game: Game }) {
  const locked = game.status !== "setup" && game.status !== "ready";

  async function toggle(on: boolean) {
    const res = await sendAction("set_option", { name: "rehearsal", on });
    if (!res.ok) toast.error(errorMessage(res.error_code, res.args));
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-center gap-3 rounded-lg border bg-white px-3 py-2 text-sm font-medium">
        {copy.mc.rehearsal}
        <Switch checked={game.rehearsal} disabled={locked} onCheckedChange={(on) => void toggle(on)} />
      </label>
      <p className="text-xs text-muted-foreground">
        {!locked ? copy.mc.rehearsalHint : game.rehearsal ? copy.mc.rehearsalOnLocked : copy.mc.rehearsalOffLocked}
      </p>
    </div>
  );
}
