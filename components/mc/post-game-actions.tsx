"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendAction } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";
import { forgetGame } from "@/lib/my-games";
import { clearReadPass } from "@/lib/read-pass";
import { clearToken, getToken } from "@/lib/role-storage";

// After the game ends: close (delete + force-exit everyone) or restart (wipe + new tokens).
export function PostGameActions() {
  const router = useRouter();
  const [busy, setBusy] = useState<"close" | "restart" | null>(null);

  async function closeGame() {
    if (!confirm(copy.mc.confirmClose)) return;
    setBusy("close");
    const token = getToken();
    const res = await sendAction("close_game", {});
    if (!res.ok) {
      setBusy(null);
      toast.error(errorMessage(res.error_code, res.args));
      return;
    }
    if (token) forgetGame(token);
    clearToken();
    clearReadPass();
    router.replace("/");
  }

  async function restartGame() {
    if (!confirm(copy.mc.confirmRestart)) return;
    setBusy("restart");
    const res = await sendAction("reset_game", { new_tokens: true });
    setBusy(null);
    if (!res.ok) {
      toast.error(errorMessage(res.error_code, res.args));
      return;
    }
    // Hard nav avoids racing McScreen's setup→lobby redirect.
    window.location.assign("/mc/setup");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{copy.mc.postGame}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{copy.mc.postGameHint}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <Button
              className="h-12 bg-red-600 text-base text-white hover:bg-red-700"
              disabled={busy !== null}
              onClick={() => void closeGame()}
            >
              <XCircle className="size-5" />
              {copy.mc.closeGame}
            </Button>
            <p className="text-xs text-muted-foreground">{copy.mc.closeGameHint}</p>
          </div>
          <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
            <Button
              className="h-12 text-base"
              variant="outline"
              disabled={busy !== null}
              onClick={() => void restartGame()}
            >
              <RotateCcw className="size-5" />
              {copy.mc.restartGame}
            </Button>
            <p className="text-xs text-muted-foreground">{copy.mc.restartGameHint}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
