"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { sendAction } from "@/lib/api";
import { teamColor } from "@/lib/colors";
import { copy, errorMessage } from "@/lib/copy";
import { rememberGame } from "@/lib/my-games";
import { POST_ICONS } from "@/lib/post-icons";
import { getDeviceId, saveToken } from "@/lib/role-storage";
import type { PostKind } from "@/lib/types";

type RoleOption =
  | { role: "mc"; label: string }
  | { role: "team"; slot: number; name: string; color: string; label: string }
  | { role: "post"; kind: PostKind; name: string; label: string };

type LookupState = {
  code: string;
  name: string;
  status: string;
  roles: Array<Record<string, unknown>>;
};

function JoinFlow() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState("");
  const [game, setGame] = useState<LookupState | null>(null);
  const [picked, setPicked] = useState<RoleOption | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const pre = params.get("code");
    if (pre) setCode(pre.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6));
  }, [params]);

  const roles = useMemo(() => {
    if (!game) return [] as RoleOption[];
    return game.roles.map((r) => {
      if (r.role === "mc") return { role: "mc" as const, label: copy.join.mcRole };
      if (r.role === "team")
        return {
          role: "team" as const,
          slot: Number(r.slot),
          name: String(r.name),
          color: String(r.color),
          label: String(r.name),
        };
      return {
        role: "post" as const,
        kind: r.kind as PostKind,
        name: String(r.name),
        label: String(r.name),
      };
    });
  }, [game]);

  const pinLen = picked?.role === "mc" ? 8 : 6;

  async function lookup() {
    setBusy(true);
    setError(null);
    const res = await sendAction<LookupState>("lookup_game", { code }, { token: null });
    setBusy(false);
    if (!res.ok || !res.state) {
      setError(errorMessage(res.error_code, res.args));
      setGame(null);
      return;
    }
    setGame(res.state);
    setPicked(null);
    setPin("");
  }

  async function submitPin() {
    if (!game || !picked || pin.length !== pinLen) return;
    setBusy(true);
    setError(null);
    const res = await sendAction<{ token: string; role: string }>(
      "join_with_pin",
      {
        code: game.code,
        role: picked.role,
        slot: picked.role === "team" ? picked.slot : undefined,
        post_kind: picked.role === "post" ? picked.kind : undefined,
        pin,
        device_id: getDeviceId(),
      },
      { token: null },
    );
    setBusy(false);
    if (!res.ok || !res.state?.token) {
      setError(errorMessage(res.error_code, res.args));
      setPin("");
      return;
    }
    saveToken(res.state.token);
    rememberGame({
      code: game.code,
      game_name: game.name,
      role: picked.role,
      label: picked.label,
      token: res.state.token,
    });
    router.push(`/join/${res.state.token}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 p-6">
      <h1 className="text-3xl font-extrabold">{copy.join.title}</h1>

      {!game ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void lookup();
          }}
        >
          <Label htmlFor="code">{copy.join.codeLabel}</Label>
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 6))}
            className="h-14 text-center font-mono text-3xl font-black tracking-[0.3em]"
            placeholder="KTPRWN"
            autoFocus
            autoComplete="off"
          />
          <p className="text-sm text-muted-foreground">{copy.join.codeHint}</p>
          {error && <p className="text-base font-semibold text-red-700">{error}</p>}
          <Button type="submit" className="h-14 text-lg font-bold" disabled={busy || code.length !== 6}>
            {copy.join.find}
          </Button>
        </form>
      ) : !picked ? (
        <div className="flex flex-col gap-4">
          <p className="text-lg font-semibold">{copy.join.gameFound(game.name, game.code)}</p>
          <p className="text-base">{copy.join.pickRole}</p>
          <div className="grid grid-cols-2 gap-3">
            {roles.map((r) => {
              if (r.role === "mc") {
                return (
                  <button
                    key="mc"
                    onClick={() => {
                      setPicked(r);
                      setPin("");
                      setError(null);
                    }}
                    className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl bg-slate-900 px-2 text-lg font-bold text-white"
                  >
                    <Crown className="size-7" />
                    {r.label}
                  </button>
                );
              }
              if (r.role === "team") {
                const c = teamColor(r.color);
                return (
                  <button
                    key={`t${r.slot}`}
                    onClick={() => {
                      setPicked(r);
                      setPin("");
                      setError(null);
                    }}
                    className="flex min-h-24 items-center justify-center rounded-xl px-2 text-xl font-bold text-white"
                    style={{ background: c.bg }}
                  >
                    {r.name}
                  </button>
                );
              }
              const Icon = POST_ICONS[r.kind];
              return (
                <button
                  key={r.kind}
                  onClick={() => {
                    setPicked(r);
                    setPin("");
                    setError(null);
                  }}
                  className="flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 border-slate-300 bg-white px-2 text-lg font-bold"
                >
                  <Icon className="size-7" />
                  {r.name}
                </button>
              );
            })}
          </div>
          <Button
            variant="outline"
            className="h-12"
            onClick={() => {
              setGame(null);
              setError(null);
            }}
          >
            {copy.join.back}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-lg font-semibold">
            {game.name} · {picked.label}
          </p>
          <Label>{copy.join.pinLabel}</Label>
          <p className="text-sm text-muted-foreground">
            {picked.role === "mc" ? copy.join.pinHintMc : copy.join.pinHint}
          </p>
          <div className="flex justify-center">
            <InputOTP
              maxLength={pinLen}
              value={pin}
              onChange={(v) => setPin(picked.role === "mc" ? v.toUpperCase().replace(/[^A-Z0-9]/g, "") : v.replace(/\D/g, ""))}
              autoFocus
            >
              <InputOTPGroup>
                {Array.from({ length: pinLen }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="size-11 text-xl font-bold sm:size-12" />
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
                setPicked(null);
                setPin("");
                setError(null);
              }}
            >
              {copy.join.back}
            </Button>
            <Button
              className="h-14 text-lg font-bold"
              disabled={busy || pin.length !== pinLen}
              onClick={() => void submitPin()}
            >
              {copy.join.enter}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<main className="p-6">{copy.common.loading}</main>}>
      <JoinFlow />
    </Suspense>
  );
}
