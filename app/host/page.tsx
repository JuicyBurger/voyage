"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendAction } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";
import { rememberGame } from "@/lib/my-games";
import { saveToken } from "@/lib/role-storage";

type Created = { game_id: string; code: string; name: string; mc_token: string; mc_pin: string };

export default function HostPage() {
  const router = useRouter();
  const [hostPassword, setHostPassword] = useState("");
  const [gameName, setGameName] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState<"code" | "pin" | null>(null);

  const saveText = useMemo(() => {
    if (!created) return "";
    return `Game ${created.code}\nMC PIN ${created.mc_pin}`;
  }, [created]);

  async function createGame() {
    setBusy(true);
    const res = await sendAction<Created>("create_game", { name: gameName.trim() }, { hostPassword, token: null });
    setBusy(false);
    if (!res.ok || !res.state) {
      toast.error(errorMessage(res.error_code, res.args));
      return;
    }
    setCreated(res.state);
    setSaved(false);
  }

  async function copyField(which: "code" | "pin") {
    if (!created) return;
    const text = which === "code" ? created.code : created.mc_pin;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      await navigator.clipboard.writeText(saveText);
      toast.success(copy.host.copied);
    }
  }

  function continueSetup() {
    if (!created || !saved) return;
    saveToken(created.mc_token);
    rememberGame({
      code: created.code,
      game_name: created.name,
      role: "mc",
      label: "MC",
      token: created.mc_token,
    });
    router.push("/mc/setup");
  }

  if (created) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-6">
        <div className="text-center">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{copy.host.step}</p>
          <h1 className="text-3xl font-extrabold">{copy.host.saveTitle}</h1>
          <p className="mt-2 text-muted-foreground">{copy.host.saveBody}</p>
        </div>
        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <div className="text-center">
              <div className="text-xs font-semibold text-muted-foreground uppercase">{copy.host.gameCode}</div>
              <div className="font-mono text-5xl font-black tracking-widest">{created.code}</div>
              <Button variant="outline" className="mt-2" onClick={() => void copyField("code")}>
                {copied === "code" ? copy.host.copied : copy.host.copy}
              </Button>
            </div>
            <div className="text-center">
              <div className="text-xs font-semibold text-muted-foreground uppercase">{copy.host.mcPin}</div>
              <div className="font-mono text-5xl font-black tracking-widest">{created.mc_pin}</div>
              <Button variant="outline" className="mt-2" onClick={() => void copyField("pin")}>
                {copied === "pin" ? copy.host.copied : copy.host.copy}
              </Button>
            </div>
            <label className="flex items-center gap-3 rounded-lg bg-muted p-3 text-base">
              <input
                type="checkbox"
                className="size-5"
                checked={saved}
                onChange={(e) => setSaved(e.target.checked)}
              />
              {copy.host.savedCheck}
            </label>
            <Button className="h-14 text-lg font-bold" disabled={!saved} onClick={continueSetup}>
              {copy.host.continue}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center p-6">
      <Card>
        <CardHeader>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{copy.host.step}</p>
          <CardTitle className="text-2xl">{copy.host.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void createGame();
            }}
          >
            <Label htmlFor="name">{copy.host.nameLabel}</Label>
            <Input
              id="name"
              value={gameName}
              onChange={(e) => setGameName(e.target.value)}
              maxLength={40}
              className="h-12 text-lg"
              placeholder={copy.host.namePlaceholder}
              autoFocus
            />
            <Label htmlFor="pw">{copy.host.passwordLabel}</Label>
            <Input
              id="pw"
              type="password"
              value={hostPassword}
              onChange={(e) => setHostPassword(e.target.value)}
              className="h-12 text-lg"
            />
            <Button type="submit" disabled={busy || !hostPassword || !gameName.trim()} className="h-12 text-base">
              {copy.host.create}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
