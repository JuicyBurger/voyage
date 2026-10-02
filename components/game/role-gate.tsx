"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { sendAction } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";
import { forgetGame, listMyGames } from "@/lib/my-games";
import { clearReadPass, ensureRolePass } from "@/lib/read-pass";
import { clearToken, getDeviceId, getToken } from "@/lib/role-storage";
import type { Identity, Role } from "@/lib/types";
import { useWakeLock } from "@/lib/use-wake-lock";
import { buttonVariants } from "@/components/ui/button";

const ROLE_PATH: Record<Role, string> = { mc: "/mc", team: "/team", post: "/post" };
const WHOAMI_POLL_MS = 15000;

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string; joinHref: string }
  | { kind: "wrong_role"; role: Role }
  | { kind: "ok"; identity: Identity };

function failState(token: string, errorCode: string | undefined, args?: Record<string, unknown>): State {
  const changed = errorCode === "BAD_TOKEN";
  const saved = listMyGames().find((g) => g.token === token);
  const joinHref = saved ? `/join?code=${encodeURIComponent(saved.code)}` : "/join";
  if (changed) {
    forgetGame(token);
    clearToken();
    clearReadPass();
  }
  return {
    kind: "error",
    message: changed ? copy.common.loginChanged : errorMessage(errorCode, args),
    joinHref,
  };
}

// Checks the stored token and only renders children for the right role.
export function RoleGate({ role, children }: { role: Role; children: (identity: Identity) => ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  useWakeLock();

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setState({ kind: "error", message: copy.common.noRole, joinHref: "/join" });
      return;
    }
    let cancelled = false;

    async function check(initial: boolean) {
      const res = await sendAction<Identity>("whoami", { device_id: getDeviceId() }, { token });
      if (cancelled) return;
      if (!res.ok || !res.state) {
        // Polls only force-exit on a dead token; other errors keep the session up.
        if (!initial && res.error_code !== "BAD_TOKEN") return;
        setState(failState(token!, res.error_code, res.args));
        return;
      }
      if (res.state.role !== role) {
        setState({ kind: "wrong_role", role: res.state.role });
        return;
      }
      if (initial) {
        const pass = await ensureRolePass(token!);
        if (cancelled) return;
        if (!pass.ok) {
          setState(failState(token!, pass.error_code, pass.args));
          return;
        }
      }
      setState({ kind: "ok", identity: res.state });
    }

    void check(true);
    const poll = setInterval(() => void check(false), WHOAMI_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [role]);

  if (state.kind === "loading") {
    return <CenterMessage>{copy.common.loading}</CenterMessage>;
  }
  if (state.kind === "error") {
    return (
      <CenterMessage>
        <p>{state.message}</p>
        <Link href={state.joinHref} className={buttonVariants({ className: "h-12 px-6 text-base" })}>
          {copy.common.joinAgain}
        </Link>
      </CenterMessage>
    );
  }
  if (state.kind === "wrong_role") {
    return (
      <CenterMessage>
        <Link href={ROLE_PATH[state.role]} className={buttonVariants({ className: "h-12 px-6 text-base" })}>
          {copy.landing.continue}
        </Link>
      </CenterMessage>
    );
  }
  return (
    <>
      {state.identity.other_device_active && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">{copy.common.alsoOpen}</div>
      )}
      {children(state.identity)}
    </>
  );
}

function CenterMessage({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center text-lg">
      {children}
    </main>
  );
}
