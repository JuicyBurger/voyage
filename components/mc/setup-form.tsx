"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendAction } from "@/lib/api";
import { TEAM_COLORS, teamColor } from "@/lib/colors";
import { copy, errorMessage } from "@/lib/copy";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Game, GameConfig, Post, PostKind, Team } from "@/lib/types";

// Defaults for the number fields (matches default_config() in Postgres).
const NUMBER_DEFAULTS: Record<string, number> = {
  "start_gold": 30,
  "parts.hull.price": 55,
  "parts.mast.price": 35,
  "parts.sail.price": 45,
  "parts.map.price": 35,
  "stock_start": 3,
  "supply_ship_add": 2,
  "job_pay.shipwright": 12,
  "job_pay.sailmaker": 12,
  "job_pay.cartographer": 12,
  "job_pay.inn": 10,
  "job_pay.blacksmith": 10,
  "fail_pay": 4,
  "jobs_per_post": 4,
  "items.flag.price": 15,
  "items.flag.raids": 3,
  "items.sword.price": 15,
  "items.sword.bonus": 1,
  "items.shield.price": 15,
  "raid.steal": 15,
  "raid.immune_minutes": 3,
  "raid.max_times_raided": 3,
};

// [label, path into config]
const NUMBER_FIELDS: [string, string[]][] = [
  ["Start gold", ["start_gold"]],
  ["Hull price", ["parts", "hull", "price"]],
  ["Mast price", ["parts", "mast", "price"]],
  ["Sail price", ["parts", "sail", "price"]],
  ["Map price", ["parts", "map", "price"]],
  ["Stock at start (each part)", ["stock_start"]],
  ["Supply Ship adds", ["supply_ship_add"]],
  ["Pay: Shipwright", ["job_pay", "shipwright"]],
  ["Pay: Sailmaker", ["job_pay", "sailmaker"]],
  ["Pay: Cartographer", ["job_pay", "cartographer"]],
  ["Pay: Harbor Inn", ["job_pay", "inn"]],
  ["Pay: Blacksmith", ["job_pay", "blacksmith"]],
  ["Pay for a failed job", ["fail_pay"]],
  ["Jobs per post (each team)", ["jobs_per_post"]],
  ["Pirate Flag price", ["items", "flag", "price"]],
  ["Raids per Flag", ["items", "flag", "raids"]],
  ["Sword price", ["items", "sword", "price"]],
  ["Sword bonus", ["items", "sword", "bonus"]],
  ["Shield price", ["items", "shield", "price"]],
  ["Raid steals", ["raid", "steal"]],
  ["Safe after a raid (minutes)", ["raid", "immune_minutes"]],
  ["Max times raided", ["raid", "max_times_raided"]],
];

function getPath(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

function setPath<T>(obj: T, path: string[], value: unknown): T {
  const copyObj = structuredClone(obj) as Record<string, unknown>;
  let cur = copyObj;
  for (const k of path.slice(0, -1)) cur = cur[k] as Record<string, unknown>;
  cur[path[path.length - 1]] = value;
  return copyObj as T;
}

export function SetupForm({ gameId }: { gameId: string }) {
  const router = useRouter();
  const [game, setGame] = useState<Game | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    const [g, t, p] = await Promise.all([
      db.from("games").select("*").eq("id", gameId).single(),
      db.from("teams").select("*").eq("game_id", gameId).order("slot"),
      db.from("posts").select("*").eq("game_id", gameId),
    ]);
    if (g.data) {
      setGame(g.data as Game);
      setConfig(g.data.config as GameConfig);
    }
    setTeams((t.data ?? []) as Team[]);
    const order: PostKind[] = ["shipwright", "sailmaker", "cartographer", "inn", "blacksmith"];
    setPosts(((p.data ?? []) as Post[]).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)));
  }, [gameId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!game || !config) return <main className="p-6">{copy.common.loading}</main>;

  const configEditable = game.status === "setup";
  const namesEditable = game.status === "setup" || game.status === "ready";
  const onboarding = game.status === "setup" || game.status === "ready";

  function updateConfig(next: GameConfig) {
    setConfig(next);
  }

  async function save() {
    setSaving(true);
    const res = await sendAction("update_setup", {
      config: configEditable ? config : undefined,
      teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      posts: posts.map((p) => ({ id: p.id, name: p.name, staff_name: p.staff_name ?? "" })),
    });
    setSaving(false);
    if (res.ok) toast.success("Saved.");
    else toast.error(res.message ?? errorMessage(res.error_code, res.args));
    await load();
    return res.ok;
  }

  async function continueToPhones() {
    setSaving(true);
    const res = await sendAction("update_setup", {
      config: configEditable ? config : undefined,
      teams: teams.map((t) => ({ id: t.id, name: t.name, color: t.color })),
      posts: posts.map((p) => ({ id: p.id, name: p.name, staff_name: p.staff_name ?? "" })),
    });
    setSaving(false);
    if (!res.ok) {
      toast.error(res.message ?? errorMessage(res.error_code, res.args));
      return;
    }
    router.push("/mc/lobby");
  }

  function resetNumbersToDefault() {
    if (!config) return;
    let next = config;
    for (const [, path] of NUMBER_FIELDS) {
      const key = path.join(".");
      const value = NUMBER_DEFAULTS[key];
      if (value !== undefined) next = setPath(next, path, value);
    }
    updateConfig(next);
    toast.success(copy.setup.resetNumbersDone);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-24">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          {onboarding && (
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{copy.setup.step}</p>
          )}
          <h1 className="text-2xl font-bold">{copy.setup.title}</h1>
        </div>
        <Badge variant="secondary">Game {game.code}</Badge>
        <Badge>{copy.status[game.status]}</Badge>
        {!onboarding && (
          <Link
            href="/mc"
            className={buttonVariants({ variant: "outline", className: "ml-auto h-10" })}
          >
            {copy.setup.backPanel}
          </Link>
        )}
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {teams.map((t, i) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-muted-foreground">{t.slot}</span>
              <Input
                value={t.name}
                disabled={!namesEditable}
                onChange={(e) => setTeams(teams.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                className="h-11 max-w-48 text-base"
              />
              <div className="flex gap-1">
                {Object.keys(TEAM_COLORS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    disabled={!namesEditable}
                    onClick={() => setTeams(teams.map((x, j) => (j === i ? { ...x, color: c } : x)))}
                    className="size-8 rounded-full border-2"
                    style={{
                      background: teamColor(c).bg,
                      borderColor: t.color === c ? "#000" : "transparent",
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Posts</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {posts.map((p, i) => (
            <div key={p.id} className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                <Input
                  value={p.name}
                  disabled={!namesEditable}
                  onChange={(e) => setPosts(posts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  className="h-11 max-w-48 text-base"
                />
                <Input
                  placeholder="Staff name"
                  value={p.staff_name ?? ""}
                  disabled={!namesEditable}
                  onChange={(e) =>
                    setPosts(posts.map((x, j) => (j === i ? { ...x, staff_name: e.target.value } : x)))
                  }
                  className="h-11 max-w-56 text-base"
                />
              </div>
              <Input
                placeholder="Job and pass rule (shown on the post phone)"
                value={config.post_rules?.[p.kind] ?? ""}
                disabled={!configEditable}
                onChange={(e) => updateConfig(setPath(config, ["post_rules", p.kind], e.target.value))}
                className="h-11"
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Numbers</CardTitle>
            {!configEditable && (
              <p className="mt-1 text-sm text-muted-foreground">Numbers are locked once the game is Ready.</p>
            )}
          </div>
          <Button
            variant="outline"
            disabled={!configEditable}
            onClick={resetNumbersToDefault}
            className="h-10"
          >
            {copy.setup.resetNumbers}
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {NUMBER_FIELDS.map(([label, path]) => (
              <div key={path.join(".")} className="flex items-center justify-between gap-2">
                <Label className="text-sm">{label}</Label>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  disabled={!configEditable}
                  value={String(getPath(config, path) ?? "")}
                  onChange={(e) => updateConfig(setPath(config, path, Number(e.target.value)))}
                  className="h-10 w-24 text-right"
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex flex-wrap justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => void save()}
          disabled={saving || !namesEditable}
          className="h-12 px-6 text-base shadow-lg"
        >
          {copy.setup.save}
        </Button>
        {onboarding ? (
          <Button
            onClick={() => void continueToPhones()}
            disabled={saving || !namesEditable}
            className="h-12 px-8 text-base shadow-lg"
          >
            {copy.setup.continue}
          </Button>
        ) : (
          <Link href="/mc" className={buttonVariants({ className: "h-12 px-8 text-base shadow-lg" })}>
            {copy.setup.backPanel}
          </Link>
        )}
      </div>
    </main>
  );
}
