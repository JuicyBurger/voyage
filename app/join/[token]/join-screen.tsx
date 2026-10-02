"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Crown } from "lucide-react";
import { useRoleLabel } from "@/components/game/use-role-label";
import { sendAction } from "@/lib/api";
import { teamColor } from "@/lib/colors";
import { copy, errorMessage } from "@/lib/copy";
import { rememberGame } from "@/lib/my-games";
import { ensureRolePass } from "@/lib/read-pass";
import { POST_ICONS } from "@/lib/post-icons";
import { getDeviceId, saveToken } from "@/lib/role-storage";
import { unlockSound } from "@/lib/sound";
import type { Identity } from "@/lib/types";
import { requestWakeLock } from "@/lib/use-wake-lock";

const ROLE_PATH = { mc: "/mc", team: "/team", post: "/post" } as const;

export function JoinScreen({ token }: { token: string }) {
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = useRoleLabel(identity);

  useEffect(() => {
    void (async () => {
      const res = await sendAction<Identity>("whoami", { device_id: getDeviceId() }, { token });
      if (res.ok && res.state) {
        saveToken(token);
        const pass = await ensureRolePass(token);
        if (!pass.ok) {
          setError(
            pass.error_code === "BAD_TOKEN" ? copy.common.loginChanged : errorMessage(pass.error_code, pass.args),
          );
          return;
        }
        setIdentity(res.state);
      } else {
        setError(
          res.error_code === "BAD_TOKEN" ? copy.common.loginChanged : errorMessage(res.error_code, res.args),
        );
      }
    })();
  }, [token]);

  // Save to My games once the friendly role name is known.
  useEffect(() => {
    if (!identity || !label) return;
    rememberGame({
      code: identity.game_code,
      game_name: identity.game_name ?? identity.game_code,
      role: identity.role,
      label: label.name,
      token,
    });
  }, [identity, label, token]);

  function start() {
    if (!identity) return;
    unlockSound();
    void requestWakeLock();
    router.push(ROLE_PATH[identity.role]);
  }

  if (error) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center text-lg">
        <p>{error}</p>
        <Button onClick={() => router.push("/join")} className="h-12 px-6 text-base">
          {copy.common.joinAgain}
        </Button>
      </main>
    );
  }
  if (!identity || !label) {
    return <main className="flex min-h-dvh items-center justify-center p-6 text-lg">{copy.join.checking}</main>;
  }

  const color = label.color ? teamColor(label.color) : null;
  const Icon = label.postKind ? POST_ICONS[label.postKind] : identity.role === "mc" ? Crown : null;

  return (
    <main
      className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6 text-center"
      style={color ? { background: color.soft } : undefined}
    >
      <p className="text-lg">{copy.join.youAre}</p>
      {Icon && <Icon className="size-16" />}
      <h1 className="text-5xl font-extrabold" style={color ? { color: color.bg } : undefined}>
        {label.name}
      </h1>
      <p className="text-muted-foreground">{copy.roles[identity.role]}</p>
      {identity.other_device_active && (
        <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">{copy.common.alsoOpen}</p>
      )}
      <Button
        onClick={start}
        className="h-16 w-full max-w-xs text-2xl font-bold"
        style={color ? { background: color.bg, color: color.text } : undefined}
      >
        {copy.join.start}
      </Button>
      <p className="max-w-xs text-sm text-muted-foreground">{copy.join.startHint}</p>
    </main>
  );
}
