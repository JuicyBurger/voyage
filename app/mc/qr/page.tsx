"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Crown } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendAction } from "@/lib/api";
import { teamColor } from "@/lib/colors";
import { copy, errorMessage } from "@/lib/copy";
import { POST_ICONS } from "@/lib/post-icons";
import { POST_KINDS, type PostKind } from "@/lib/types";

type TokenRow = {
  token: string;
  pin: string;
  role: "mc" | "team" | "post";
  team_id: string | null;
  post_id: string | null;
};
type TokensState = {
  tokens: TokenRow[];
  teams: { id: string; slot: number; name: string; color: string; active?: boolean }[];
  posts: { id: string; kind: PostKind; name: string; staff_name: string | null; active?: boolean }[];
  code: string;
  name?: string;
};

type CardInfo = {
  token: string;
  pin: string;
  title: string;
  subtitle: string;
  color?: string;
  postKind?: PostKind;
  order: number;
};

const BASE_KEY = "vc_qr_base";

export default function QrPage() {
  const [data, setData] = useState<TokensState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [base, setBase] = useState("");
  const [selected, setSelected] = useState<CardInfo | null>(null);

  useEffect(() => {
    setBase(localStorage.getItem(BASE_KEY) ?? window.location.origin);
    void sendAction<TokensState>("get_codes").then((res) => {
      if (res.ok && res.state) setData(res.state);
      else setError(errorMessage(res.error_code, res.args));
    });
  }, []);

  if (error) return <main className="p-6 text-lg">{error}</main>;
  if (!data) return <main className="p-6">{copy.common.loading}</main>;

  // Teams and posts switched off in setup ("Tidak main") get no card.
  const inPlay = data.tokens.filter((t) => {
    if (t.role === "team") return data.teams.find((x) => x.id === t.team_id)?.active !== false;
    if (t.role === "post") return data.posts.find((x) => x.id === t.post_id)?.active !== false;
    return true;
  });
  const cards: CardInfo[] = inPlay.map((t) => {
    if (t.role === "team") {
      const team = data.teams.find((x) => x.id === t.team_id)!;
      return {
        token: t.token,
        pin: t.pin,
        title: team.name,
        subtitle: "Team phone",
        color: team.color,
        order: team.slot,
      };
    }
    if (t.role === "post") {
      const post = data.posts.find((x) => x.id === t.post_id)!;
      return {
        token: t.token,
        pin: t.pin,
        title: post.name,
        subtitle: post.staff_name ? `Post phone · ${post.staff_name}` : "Post phone",
        postKind: post.kind,
        order: 10 + POST_KINDS.indexOf(post.kind),
      };
    }
    return { token: t.token, pin: t.pin, title: "The MC", subtitle: "Game master", order: 0 };
  });
  cards.sort((a, b) => a.order - b.order);

  const cleanBase = base.replace(/\/+$/, "");
  const selectedColor = selected?.color ? teamColor(selected.color) : null;
  const SelectedIcon = selected
    ? selected.postKind
      ? POST_ICONS[selected.postKind]
      : !selected.color
        ? Crown
        : null
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl p-4">
      <div className="mb-4 flex flex-wrap items-end gap-3 print:hidden">
        <Link href="/mc" className={buttonVariants({ variant: "outline", className: "h-10" })}>
          {copy.setup.backPanel}
        </Link>
        <div className="flex flex-col gap-1">
          <Label htmlFor="base">Link address (use your Wi-Fi address when testing on phones)</Label>
          <Input
            id="base"
            value={base}
            onChange={(e) => {
              setBase(e.target.value);
              localStorage.setItem(BASE_KEY, e.target.value);
            }}
            className="h-10 w-80"
          />
        </div>
        <Button onClick={() => window.print()} className="h-10">
          Print
        </Button>
        <p className="text-sm text-muted-foreground">
          TV screen: {cleanBase}/screen/{data.code}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3 print:gap-3">
        {cards.map((c) => {
          const color = c.color ? teamColor(c.color) : null;
          const Icon = c.postKind ? POST_ICONS[c.postKind] : !c.color ? Crown : null;
          return (
            <button
              key={c.token}
              type="button"
              onClick={() => setSelected(c)}
              className="flex min-h-28 break-inside-avoid flex-col items-center justify-center gap-2 rounded-xl border-4 bg-white p-4 text-center transition hover:bg-slate-50 print:min-h-0 print:pointer-events-none print:gap-2 print:p-4"
              style={{ borderColor: color?.bg ?? "#111" }}
            >
              <div className="flex items-center gap-2">
                {Icon && <Icon className="size-7" />}
                <span className="text-2xl font-extrabold" style={{ color: color?.bg }}>
                  {c.title}
                </span>
              </div>
              {/* Full card only when printing */}
              <div className="hidden flex-col items-center gap-2 print:flex">
                <QRCodeSVG value={`${cleanBase}/join/${c.token}`} size={160} level="M" marginSize={1} />
                <span className="text-sm">{c.subtitle}</span>
                <span className="text-base font-bold leading-tight">
                  {copy.codes.cardLine(data.code, c.title, c.pin)}
                </span>
                <span className="text-xs text-muted-foreground">Scan with the phone camera</span>
              </div>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 top-0 left-0 flex h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col items-center justify-center gap-5 rounded-none border-0 bg-white p-6 ring-0 print:hidden sm:max-w-none"
        >
          {selected && (
            <>
              <DialogHeader className="items-center text-center">
                <div className="mb-1 flex items-center justify-center gap-2">
                  {SelectedIcon && <SelectedIcon className="size-10" style={{ color: selectedColor?.bg }} />}
                  <DialogTitle
                    className="text-4xl font-extrabold"
                    style={selectedColor ? { color: selectedColor.bg } : undefined}
                  >
                    {selected.title}
                  </DialogTitle>
                </div>
                <DialogDescription className="text-lg">{selected.subtitle}</DialogDescription>
              </DialogHeader>
              <div
                className="rounded-2xl border-4 p-4"
                style={{ borderColor: selectedColor?.bg ?? "#111" }}
              >
                <QRCodeSVG value={`${cleanBase}/join/${selected.token}`} size={280} level="M" marginSize={1} />
              </div>
              <p className="text-center text-xl font-bold leading-tight">
                {copy.codes.cardLine(data.code, selected.title, selected.pin)}
              </p>
              <p className="text-sm text-muted-foreground">{copy.lobby.scanHint}</p>
              <Button className="h-14 w-full max-w-xs text-lg font-bold" onClick={() => setSelected(null)}>
                {copy.lobby.closeQr}
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </main>
  );
}
