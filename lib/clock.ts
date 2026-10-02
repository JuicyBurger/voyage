import type { Game, WorldEvent } from "./types";

// Same formula as _event_ms() in SQL.
export function eventMs(game: Game, now: number): number {
  const start = game.config.clock.play_start_minute * 60000;
  if (!game.started_at) return start;
  const until = game.paused_at
    ? Date.parse(game.paused_at)
    : game.ended_at
      ? Date.parse(game.ended_at)
      : now;
  // speed and paused_ms_total can arrive as strings (Postgres numeric / bigint).
  const speed = Number(game.speed) || 1;
  const paused = Number(game.paused_ms_total) || 0;
  return start + (until - Date.parse(game.started_at) - paused) * speed;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function activeEvent(events: WorldEvent[], kind: string, now: number): WorldEvent | undefined {
  return events.find(
    (e) =>
      e.kind === kind &&
      !e.cancelled_at &&
      e.ends_at &&
      Date.parse(e.starts_at) <= now &&
      Date.parse(e.ends_at) > now,
  );
}

// Every timed event running right now, newest first.
export function activeEvents(events: WorldEvent[], now: number): WorldEvent[] {
  return events.filter(
    (e) => !e.cancelled_at && e.ends_at && Date.parse(e.starts_at) <= now && Date.parse(e.ends_at) > now,
  );
}

export function isPlaying(game: Game) {
  return (game.status === "running" || game.status === "last_call") && !game.paused_at;
}
