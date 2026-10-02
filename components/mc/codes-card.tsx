"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendAction } from "@/lib/api";
import { copy, errorMessage } from "@/lib/copy";
import type { PostKind } from "@/lib/types";

type TokenRow = {
  id: string;
  token: string;
  pin: string;
  role: "mc" | "team" | "post";
  team_id: string | null;
  post_id: string | null;
};

type CodesState = {
  tokens: TokenRow[];
  teams: { id: string; slot: number; name: string; color: string }[];
  posts: { id: string; kind: PostKind; name: string }[];
  code: string;
  name: string;
  expires_at: string;
};

type Row = { id: string; label: string; pin: string; order: number };

export function CodesCard() {
  const [shown, setShown] = useState(false);
  const [data, setData] = useState<CodesState | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await sendAction<CodesState>("get_codes");
    if (res.ok && res.state) setData(res.state);
    else toast.error(errorMessage(res.error_code, res.args));
  }

  useEffect(() => {
    if (shown) void load();
  }, [shown]);

  async function rotate(roleId: string) {
    if (!confirm(copy.codes.rotateWarn)) return;
    setBusy(true);
    const res = await sendAction("rotate_role", { role_id: roleId });
    setBusy(false);
    if (!res.ok) {
      toast.error(errorMessage(res.error_code, res.args));
      return;
    }
    toast.success(copy.codes.rotated);
    await load();
  }

  const rows: Row[] = [];
  if (data) {
    for (const t of data.tokens) {
      if (t.role === "mc") rows.push({ id: t.id, label: "MC", pin: t.pin, order: 0 });
      else if (t.role === "team") {
        const team = data.teams.find((x) => x.id === t.team_id);
        rows.push({ id: t.id, label: team?.name ?? "Team", pin: t.pin, order: team?.slot ?? 9 });
      } else {
        const post = data.posts.find((x) => x.id === t.post_id);
        rows.push({ id: t.id, label: post?.name ?? "Post", pin: t.pin, order: 10 });
      }
    }
    rows.sort((a, b) => a.order - b.order);
  }

  const expires = data?.expires_at
    ? new Date(data.expires_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="size-5" /> {copy.codes.title}
        </CardTitle>
        <Button variant="outline" size="sm" onClick={() => setShown((s) => !s)}>
          {shown ? copy.codes.hide : copy.codes.show}
        </Button>
      </CardHeader>
      {shown && (
        <CardContent className="flex flex-col gap-3">
          {expires && <p className="text-sm text-muted-foreground">{copy.codes.expires(expires)}</p>}
          {data && (
            <p className="text-sm font-semibold">
              {data.name} · {data.code}
            </p>
          )}
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                <div>
                  <div className="font-semibold">{r.label}</div>
                  <div className="font-mono text-xl font-bold tracking-wider">{r.pin}</div>
                </div>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => void rotate(r.id)}>
                  {copy.codes.rotate}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
