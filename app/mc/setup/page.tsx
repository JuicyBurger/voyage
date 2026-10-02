"use client";

import { copy, errorMessage } from "@/lib/copy";
import { ensureRolePass } from "@/lib/read-pass";
import { getDeviceId, getToken } from "@/lib/role-storage";
import { SetupForm } from "@/components/mc/setup-form";
import { sendAction } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import Link from "next/link";
import { useEffect, useState } from "react";

// MC setup: names and numbers. Creating a game is on /host.
export default function SetupPage() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setChecking(false);
      setError(copy.common.noRole);
      return;
    }
    void (async () => {
      const res = await sendAction<{ game_id: string; role: string }>("whoami", { device_id: getDeviceId() }, { token });
      if (!res.ok || res.state?.role !== "mc" || !res.state.game_id) {
        setError(res.ok ? copy.common.noRole : errorMessage(res.error_code, res.args));
        setChecking(false);
        return;
      }
      const pass = await ensureRolePass(token);
      if (!pass.ok) {
        setError(pass.error_code === "BAD_TOKEN" ? copy.common.loginChanged : errorMessage(pass.error_code, pass.args));
        setChecking(false);
        return;
      }
      setGameId(res.state.game_id);
      setChecking(false);
    })();
  }, []);

  if (checking) return <main className="p-6">{copy.common.loading}</main>;

  if (!gameId) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg">{error ?? copy.common.noRole}</p>
        <Link href="/host" className={buttonVariants({ className: "h-12 px-6 text-base" })}>
          {copy.landing.host}
        </Link>
        <Link href="/join" className={buttonVariants({ variant: "outline", className: "h-12 px-6 text-base" })}>
          {copy.landing.join}
        </Link>
      </main>
    );
  }

  return <SetupForm gameId={gameId} />;
}
