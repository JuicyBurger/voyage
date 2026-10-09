"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";
import { Crown, QrCode } from "lucide-react";
import { RehearsalSwitch } from "@/components/mc/rehearsal-switch";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendAction } from "@/lib/api";
import { teamColor } from "@/lib/colors";
import { copy, errorMessage, itemName } from "@/lib/copy";
import { ensureRolePass } from "@/lib/read-pass";
import { getDeviceId, getToken } from "@/lib/role-storage";
import { PARTS, type Game, type GameConfig, type PostKind } from "@/lib/types";

type TokenRow = {
  id: string;
  token: string;
  pin: string;
  role: "mc" | "team" | "post";
  team_id: string | null;
  post_id: string | null;
  last_seen_at: string | null;
  connected: boolean;
};

type LobbyState = {
  tokens: TokenRow[];
  teams: { id: string; slot: number; name: string; color: string; active?: boolean }[];
  posts: { id: string; kind: PostKind; name: string; active?: boolean }[];
  code: string;
  name: string;
  status: Game["status"];
  rehearsal: boolean;
  auto_fire: boolean;
  config: GameConfig;
};

type Row = {
  id: string;
  token: string;
  label: string;
  pin: string;
  connected: boolean;
  color?: string;
  order: number;
};

const BASE_KEY = "vc_qr_base";
const PINS_KEY = "vc_show_pins";

export default function LobbyPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<LobbyState | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [busy, setBusy] = useState(false);
  const [qrRow, setQrRow] = useState<Row | null>(null);
  const [joinBase, setJoinBase] = useState("");

  useEffect(() => {
    setShowPins(sessionStorage.getItem(PINS_KEY) === "1");
  }, []);

  const load = useCallback(async () => {
    const res = await sendAction<LobbyState>("get_codes");
    if (!res.ok || !res.state) {
      toast.error(errorMessage(res.error_code, res.args));
      return null;
    }
    setData(res.state);
    return res.state;
  }, []);

  useEffect(() => {
    setJoinBase((localStorage.getItem(BASE_KEY) ?? window.location.origin).replace(/\/+$/, ""));
    const token = getToken();
    if (!token) {
      setChecking(false);
      setError(copy.common.noRole);
      return;
    }
    let cancelled = false;
    void (async () => {
      const [who, pass] = await Promise.all([
        sendAction<{ game_id: string; role: string }>("whoami", { device_id: getDeviceId() }, { token }),
        ensureRolePass(token),
      ]);
      if (cancelled) return;
      if (!who.ok || who.state?.role !== "mc" || !who.state.game_id) {
        setError(who.ok ? copy.common.noRole : errorMessage(who.error_code, who.args));
        setChecking(false);
        return;
      }
      if (!pass.ok) {
        setError(pass.error_code === "BAD_TOKEN" ? copy.common.loginChanged : errorMessage(pass.error_code, pass.args));
        setChecking(false);
        return;
      }
      const lobby = await load();
      if (cancelled) return;
      if (lobby && lobby.status !== "setup" && lobby.status !== "ready") {
        router.replace("/mc");
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load, router]);

  useEffect(() => {
    if (checking || error) return;
    const tick = setInterval(() => void load(), 4000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [checking, error, load]);

  const rows: Row[] = useMemo(() => {
    if (!data) return [];
    const list: Row[] = [];
    for (const t of data.tokens) {
      if (t.role === "mc") {
        list.push({
          id: t.id,
          token: t.token,
          label: copy.roles.mc,
          pin: t.pin,
          connected: t.connected,
          order: 0,
        });
      } else if (t.role === "team") {
        const team = data.teams.find((x) => x.id === t.team_id);
        // Teams and posts switched off in setup ("Tidak main") have no phone in this game.
        if (team?.active === false) continue;
        list.push({
          id: t.id,
          token: t.token,
          label: team?.name ?? "Team",
          pin: t.pin,
          connected: t.connected,
          color: team?.color,
          order: team?.slot ?? 9,
        });
      } else {
        const post = data.posts.find((x) => x.id === t.post_id);
        if (post?.active === false) continue;
        list.push({
          id: t.id,
          token: t.token,
          label: post?.name ?? "Post",
          pin: t.pin,
          connected: t.connected,
          order: 10,
        });
      }
    }
    return list.sort((a, b) => a.order - b.order);
  }, [data]);

  const phones = rows.filter((r) => r.order !== 0);
  const connectedCount = rows.filter((r) => r.connected).length;

  async function startGame() {
    if (!data) return;
    if (data.config?.parts) {
      const inactiveSellers = PARTS.filter((part) => {
        const kind = data.config.parts[part].post;
        const post = data.posts.find((x) => x.kind === kind);
        return post?.active === false;
      });
      if (inactiveSellers.length) {
        toast.error(copy.setup.noSellerWarn(inactiveSellers.map(itemName).join(", ")));
        return;
      }
    }
    if (data.auto_fire === false && !confirm(copy.lobby.autoFireOffWarn)) return;
    const waiting = phones.filter((r) => !r.connected);
    if (waiting.length > 0 && !confirm(copy.lobby.startWarn)) return;
    setBusy(true);
    if (data.status === "setup") {
      const ready = await sendAction("game_control", { action: "ready" });
      if (!ready.ok) {
        setBusy(false);
        toast.error(errorMessage(ready.error_code, ready.args));
        return;
      }
    }
    const started = await sendAction("game_control", { action: "start" });
    setBusy(false);
    if (!started.ok) {
      toast.error(errorMessage(started.error_code, started.args));
      return;
    }
    router.push("/mc");
  }

  if (checking) return <main className="p-6">{copy.common.loading}</main>;

  if (error || !data) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg">{error ?? copy.common.noRole}</p>
        <Link href="/host" className={buttonVariants({ className: "h-12 px-6 text-base" })}>
          {copy.landing.host}
        </Link>
      </main>
    );
  }

  const gameStub = {
    status: data.status,
    rehearsal: data.rehearsal,
  } as Game;

  const qrColor = qrRow?.color ? teamColor(qrRow.color) : null;
  const qrUrl = qrRow ? `${joinBase}/join/${qrRow.token}` : "";

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 p-4 pb-28">
      <header className="flex flex-wrap items-center gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{copy.lobby.step}</p>
          <h1 className="text-3xl font-extrabold">{copy.lobby.title}</h1>
        </div>
        <Badge variant="secondary" className="ml-auto">
          {data.name}
        </Badge>
      </header>

      <p className="text-base text-muted-foreground">{copy.lobby.body}</p>

      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-6">
          <div className="text-xs font-semibold text-muted-foreground uppercase">{copy.lobby.gameCode}</div>
          <div className="font-mono text-5xl font-black tracking-widest">{data.code}</div>
          <Link href="/mc/qr" className={buttonVariants({ variant: "outline", className: "h-12 w-full text-base" })}>
            {copy.lobby.openQr}
          </Link>
        </CardContent>
      </Card>

      <RehearsalSwitch game={gameStub} />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-lg">
            {copy.lobby.connectedCount(connectedCount, rows.length)}
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setShowPins((s) => {
                const next = !s;
                sessionStorage.setItem(PINS_KEY, next ? "1" : "0");
                return next;
              })
            }
          >
            {showPins ? copy.lobby.hidePins : copy.lobby.showPins}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y">
            {rows.map((r) => {
              const c = r.color ? teamColor(r.color) : null;
              return (
                <li key={r.id} className="flex items-center gap-2 px-4 py-3">
                  {r.order === 0 ? (
                    <Crown className="size-5 shrink-0" />
                  ) : (
                    <span
                      className="size-3 shrink-0 rounded-full"
                      style={{ background: c?.bg ?? "#64748b" }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{r.label}</div>
                    {showPins && <div className="font-mono text-sm tracking-wider text-muted-foreground">{r.pin}</div>}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0 gap-1 px-2"
                    onClick={() => setQrRow(r)}
                  >
                    <QrCode className="size-4" />
                    {copy.lobby.showQr}
                  </Button>
                  <Badge variant={r.connected ? "default" : "secondary"}>
                    {r.connected ? copy.lobby.connected : copy.lobby.waiting}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {qrRow && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white p-6 print:hidden">
          <div className="text-center">
            <h2 className="text-4xl font-extrabold" style={qrColor ? { color: qrColor.bg } : undefined}>
              {qrRow.label}
            </h2>
            <p className="mt-2 text-base text-muted-foreground">
              {copy.codes.cardLine(data.code, qrRow.label, qrRow.pin)}
            </p>
          </div>
          <div className="rounded-2xl border-4 p-4" style={{ borderColor: qrColor?.bg ?? "#111" }}>
            <QRCodeSVG value={qrUrl} size={280} level="M" marginSize={1} />
          </div>
          <p className="text-sm text-muted-foreground">{copy.lobby.scanHint}</p>
          <Button className="h-14 w-full max-w-xs text-lg font-bold" onClick={() => setQrRow(null)}>
            {copy.lobby.closeQr}
          </Button>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto flex w-full max-w-lg gap-3">
          <Link
            href="/mc/setup"
            className={buttonVariants({ variant: "outline", className: "h-14 flex-1 text-base" })}
          >
            {copy.lobby.backSetup}
          </Link>
          <Button className="h-14 flex-[1.4] text-lg font-bold" disabled={busy} onClick={() => void startGame()}>
            {busy ? copy.lobby.starting : copy.lobby.start}
          </Button>
        </div>
      </div>
    </main>
  );
}
