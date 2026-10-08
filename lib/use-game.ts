"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sendAction } from "./api";
import { refreshReadPass } from "./read-pass";
import { supabaseBrowser } from "./supabase-browser";
import type { Action, Game, JobCount, Part, Post, Prices, Raid, Score, Team, WorldEvent } from "./types";
import type { RealtimeChannel } from "@supabase/supabase-js";

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

const HEARTBEAT_MS = 15000;
const DOWN_POLL_MS = 5000;

// Loads the whole game once, then keeps it fresh with Realtime.
// Heartbeat resyncs even while "connected" so a zombie channel cannot freeze the UI.
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
          const { data: g, error } = await db.from("games").select("*").eq("id", gameId).single();
          if (!error && g) setData((d) => ({ ...d, game: g as Game }));
          break;
        }
        case "teams": {
          const { data: t, error } = await db.from("teams").select("*").eq("game_id", gameId).order("slot");
          if (!error && t) setData((d) => ({ ...d, teams: t as Team[] }));
          break;
        }
        case "posts": {
          const { data: p, error } = await db.from("posts").select("*").eq("game_id", gameId);
          if (!error && p) {
            const sorted = (p as Post[]).sort((a, b) => POST_ORDER.indexOf(a.kind) - POST_ORDER.indexOf(b.kind));
            setData((d) => ({ ...d, posts: sorted }));
          }
          break;
        }
        case "stock": {
          const { data: s, error } = await db.from("stock").select("part, qty").eq("game_id", gameId);
          if (!error && s) {
            const map = Object.fromEntries(s.map((r) => [r.part, r.qty])) as Record<Part, number>;
            setData((d) => ({ ...d, stock: map }));
          }
          break;
        }
        case "job_counts": {
          const { data: j, error } = await db.from("job_counts").select("team_id, post_id, count").eq("game_id", gameId);
          if (!error && j) setData((d) => ({ ...d, jobCounts: j as JobCount[] }));
          break;
        }
        case "world_events": {
          const { data: e, error } = await db
            .from("world_events")
            .select("*")
            .eq("game_id", gameId)
            .order("created_at", { ascending: false })
            .limit(40);
          if (!error && e) setData((d) => ({ ...d, events: e as WorldEvent[] }));
          break;
        }
        case "actions": {
          if (actionsFilter === "none") {
            setData((d) => ({ ...d, actions: [] }));
            break;
          }
          let q = db.from("actions").select("*").eq("game_id", gameId);
          if (actionsFilter !== "all") q = q.eq(actionsFilter.column, actionsFilter.value);
          const { data: a, error } = await q.order("created_at", { ascending: false }).limit(actionsLimit);
          if (!error && a) setData((d) => ({ ...d, actions: a as Action[] }));
          break;
        }
        case "raids": {
          const { data: r, error } = await db
            .from("raids")
            .select("*")
            .eq("game_id", gameId)
            .order("created_at", { ascending: false })
            .limit(30);
          if (!error && r) setData((d) => ({ ...d, raids: r as Raid[] }));
          break;
        }
        case "prices": {
          const { data: pr, error } = await db.rpc("current_prices", { p_game_id: gameId });
          if (!error && pr) setData((d) => ({ ...d, prices: pr as Prices }));
          break;
        }
        case "scores": {
          const { data: sc, error } = await db.rpc("game_scores", { p_game_id: gameId });
          if (!error && sc) setData((d) => ({ ...d, scores: sc as Score[] }));
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
    let channel: RealtimeChannel | null = null;
    let cancelled = false;

    function bind(ch: RealtimeChannel) {
      for (const table of TABLES) {
        const filter = table === "games" ? `id=eq.${gameId}` : `game_id=eq.${gameId}`;
        ch.on("postgres_changes", { event: "*", schema: "public", table, filter }, () => {
          schedule(table);
          if (table === "games" || table === "world_events") schedule("prices");
          if (table === "teams" || table === "games") schedule("scores");
        });
      }
    }

    function subscribe() {
      if (cancelled || !gameId) return;
      const ch = db.channel(`game-${gameId}-${Math.random().toString(36).slice(2)}`);
      channel = ch;
      bind(ch);
      ch.subscribe((status) => {
        if (cancelled) return;
        const up = status === "SUBSCRIBED";
        setConnected(up);
        if (up && wasDown) {
          void refreshReadPass().then(() => loadAll());
        }
        if (!up) wasDown = true;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          setConnected(false);
          wasDown = true;
          const dead = ch;
          void db.removeChannel(dead).then(() => {
            if (!cancelled && channel === dead) subscribe();
          });
        }
      });
    }

    subscribe();

    // Always resync on a heartbeat so a "joined" but silent channel cannot freeze gold/status.
    const heartbeat = setInterval(() => void loadAll(), HEARTBEAT_MS);
    const downPoll = setInterval(() => {
      if (channel?.state !== "joined") void loadAll();
    }, DOWN_POLL_MS);
    const resync = setInterval(() => void sendAction("ping", {}, { token: null }), 60000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshReadPass().then(() => loadAll());
        void sendAction("ping", {}, { token: null });
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      clearInterval(downPoll);
      clearInterval(resync);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void db.removeChannel(channel);
    };
  }, [gameId, loadAll, schedule]);

  const ready =
    data.game && data.teams && data.posts && data.stock && data.jobCounts && data.events && data.actions && data.raids
      ? (data as GameData)
      : null;

  return { data: ready, connected, refresh: loadAll };
}
