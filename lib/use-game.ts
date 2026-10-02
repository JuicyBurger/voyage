"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendAction } from "./api";
import { refreshReadPass } from "./read-pass";
import { supabaseBrowser } from "./supabase-browser";
import type { Action, Game, JobCount, Part, Post, Prices, Raid, Score, Team, WorldEvent } from "./types";

export type ActionsFilter = { column: "team_id" | "actor_post_id"; value: string } | "all" | "none";

export type GameData = {
  game: Game;
  teams: Team[];
  posts: Post[];
  stock: Record<Part, number>;
  jobCounts: JobCount[];
  events: WorldEvent[];
  actions: Action[];
  raids: Raid[];
  prices: Prices | null;
  scores: Score[] | null;
};

type Extra = "prices" | "scores";

type Table = "games" | "teams" | "posts" | "stock" | "job_counts" | "world_events" | "actions" | "raids";
const TABLES: Table[] = ["games", "teams", "posts", "stock", "job_counts", "world_events", "actions", "raids"];
const POST_ORDER = ["shipwright", "sailmaker", "cartographer", "inn", "blacksmith"];

// Loads the whole game once, then keeps it fresh with Realtime.
// If Realtime drops, it polls every 5 seconds until it is back.
export function useGame(gameId: string | null, actionsFilter: ActionsFilter = "none", actionsLimit = 50) {
  const [data, setData] = useState<Partial<GameData>>({});
  const [connected, setConnected] = useState(true);
  const timers = useRef<Partial<Record<Table | Extra, ReturnType<typeof setTimeout>>>>({});
  const filterKey = typeof actionsFilter === "string" ? actionsFilter : `${actionsFilter.column}:${actionsFilter.value}`;

  const load = useCallback(
    async (what: Table | Extra) => {
      if (!gameId) return;
      const db = supabaseBrowser();
      switch (what) {
        case "games": {
          const { data: g } = await db.from("games").select("*").eq("id", gameId).single();
          if (g) setData((d) => ({ ...d, game: g as Game }));
          break;
        }
        case "teams": {
          const { data: t } = await db.from("teams").select("*").eq("game_id", gameId).order("slot");
          if (t) setData((d) => ({ ...d, teams: t as Team[] }));
          break;
        }
        case "posts": {
          const { data: p } = await db.from("posts").select("*").eq("game_id", gameId);
          if (p) {
            const sorted = (p as Post[]).sort((a, b) => POST_ORDER.indexOf(a.kind) - POST_ORDER.indexOf(b.kind));
            setData((d) => ({ ...d, posts: sorted }));
          }
          break;
        }
        case "stock": {
          const { data: s } = await db.from("stock").select("part, qty").eq("game_id", gameId);
          if (s) {
            const map = Object.fromEntries(s.map((r) => [r.part, r.qty])) as Record<Part, number>;
            setData((d) => ({ ...d, stock: map }));
          }
          break;
        }
        case "job_counts": {
          const { data: j } = await db.from("job_counts").select("team_id, post_id, count").eq("game_id", gameId);
          if (j) setData((d) => ({ ...d, jobCounts: j as JobCount[] }));
          break;
        }
        case "world_events": {
          const { data: e } = await db
            .from("world_events")
            .select("*")
            .eq("game_id", gameId)
            .order("created_at", { ascending: false })
            .limit(40);
          if (e) setData((d) => ({ ...d, events: e as WorldEvent[] }));
          break;
        }
        case "actions": {
          if (actionsFilter === "none") {
            setData((d) => ({ ...d, actions: [] }));
            break;
          }
          let q = db.from("actions").select("*").eq("game_id", gameId);
          if (actionsFilter !== "all") q = q.eq(actionsFilter.column, actionsFilter.value);
          const { data: a } = await q.order("created_at", { ascending: false }).limit(actionsLimit);
          if (a) setData((d) => ({ ...d, actions: a as Action[] }));
          break;
        }
        case "raids": {
          const { data: r } = await db
            .from("raids")
            .select("*")
            .eq("game_id", gameId)
            .order("created_at", { ascending: false })
            .limit(30);
          if (r) setData((d) => ({ ...d, raids: r as Raid[] }));
          break;
        }
        case "prices": {
          const { data: pr } = await db.rpc("current_prices", { p_game_id: gameId });
          if (pr) setData((d) => ({ ...d, prices: pr as Prices }));
          break;
        }
        case "scores": {
          const { data: sc } = await db.rpc("game_scores", { p_game_id: gameId });
          if (sc) setData((d) => ({ ...d, scores: sc as Score[] }));
          break;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gameId, filterKey, actionsLimit],
  );

  const loadAll = useCallback(async () => {
    await Promise.all([...TABLES, "prices" as const, "scores" as const].map((t) => load(t)));
  }, [load]);

  const schedule = useCallback(
    (what: Table | Extra) => {
      clearTimeout(timers.current[what]);
      timers.current[what] = setTimeout(() => void load(what), 120);
    },
    [load],
  );

  useEffect(() => {
    if (!gameId) return;
    void loadAll();
    void sendAction("ping", {}, { token: null });

    const db = supabaseBrowser();
    let wasDown = false;
    const channel = db.channel(`game-${gameId}-${Math.random().toString(36).slice(2)}`);
    for (const table of TABLES) {
      const filter = table === "games" ? `id=eq.${gameId}` : `game_id=eq.${gameId}`;
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => {
        schedule(table);
        if (table === "games" || table === "world_events") schedule("prices");
        if (table === "teams" || table === "games") schedule("scores");
      });
    }
    channel.subscribe((status) => {
      const up = status === "SUBSCRIBED";
      setConnected(up);
      if (up && wasDown) {
        void refreshReadPass().then(() => loadAll());
      }
      if (!up) wasDown = true;
    });

    const poll = setInterval(() => {
      if (channel.state !== "joined") void loadAll();
    }, 5000);
    const resync = setInterval(() => void sendAction("ping", {}, { token: null }), 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshReadPass().then(() => loadAll());
        void sendAction("ping", {}, { token: null });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(poll);
      clearInterval(resync);
      document.removeEventListener("visibilitychange", onVisible);
      void db.removeChannel(channel);
    };
  }, [gameId, loadAll, schedule]);

  const ready =
    data.game && data.teams && data.posts && data.stock && data.jobCounts && data.events && data.actions && data.raids
      ? (data as GameData)
      : null;

  return { data: ready, connected, refresh: loadAll };
}
