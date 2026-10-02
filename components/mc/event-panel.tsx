"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { sendAction } from "@/lib/api";
import { activeEvent, eventMs, formatClock, isPlaying } from "@/lib/clock";
import { copy, errorMessage, eventName } from "@/lib/copy";
import type { GameData } from "@/lib/use-game";
import { useNow } from "@/lib/use-now";

const EVENT_BUTTONS = ["gold_rush", "storm", "supply_ship", "lighthouse_aid", "market_sale", "pirate_hour", "bounty"];
const TIMED = ["gold_rush", "storm", "market_sale", "pirate_hour", "bounty"];

async function run(type: string, input: Record<string, unknown>) {
  const res = await sendAction(type, input);
  if (!res.ok) toast.error(errorMessage(res.error_code, res.args));
  return res.ok;
}

export function EventPanel({ data }: { data: GameData }) {
  const { game, events } = data;
  const cfg = game.config;
  const now = useNow();
  const minuteNow = eventMs(game, now) / 60000;
  const playing = isPlaying(game);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const isFired = (index: number, kind: string) =>
    events.some((e) => e.schedule_index === index && !e.cancelled_at) ||
    (kind === "last_call" && (game.status === "last_call" || game.status === "ended"));

  const schedule = cfg.schedule.map((s, index) => ({ ...s, index, fired: isFired(index, s.kind) }));
  const next = schedule.find((s) => !s.fired);
  const due = (s: { minute: number }) => playing && minuteNow >= s.minute;

  async function fire(kind: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const ok = await run("fire_event", { kind, ...extra });
    setBusy(false);
    return ok;
  }

  // Auto-fire: when the clock reaches a scheduled minute, fire it once from this browser.
  // The server refuses a second fire of the same schedule line, so two MC tabs are safe.
  const tried = useRef(new Set<number>());
  useEffect(() => {
    if (!game.auto_fire || !playing) return;
    for (const s of schedule) {
      if (!s.fired && minuteNow >= s.minute && !tried.current.has(s.index)) {
        tried.current.add(s.index);
        void sendAction("fire_event", { kind: s.kind, schedule_index: s.index }).then((res) => {
          if (res.error_code === "NETWORK") tried.current.delete(s.index);
        });
      }
    }
  });

  const lastCallTime = game.status === "running" && minuteNow >= cfg.clock.last_call_minute;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{copy.mc.nextEvent}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {lastCallTime && (
            <div className="animate-pulse rounded-lg bg-amber-500 p-3 text-center text-xl font-black text-white">
              {copy.mc.timeForLastCall}
            </div>
          )}
          {next ? (
            <div
              className={`flex items-center justify-between gap-3 rounded-lg border-2 p-3 ${due(next) ? "border-amber-500 bg-amber-50" : ""}`}
            >
              <div>
                <div className="text-xl font-bold">{eventName(next.kind)}</div>
                <div className="text-sm text-muted-foreground">
                  {due(next) ? copy.mc.dueNow : copy.mc.atMinute(next.minute)}
                </div>
              </div>
              <Button
                className="h-12 px-5 text-base"
                disabled={busy || !playing}
                onClick={() => fire(next.kind, { schedule_index: next.index })}
              >
                {copy.mc.fireNow}
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground">{copy.mc.noNextEvent}</p>
          )}

          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted p-3">
            <span className="text-sm font-medium">{copy.mc.autoFire}</span>
            <Switch checked={game.auto_fire} onCheckedChange={(on) => void run("set_option", { name: "auto_fire", on })} />
          </div>

          <div>
            <div className="mb-1 text-sm font-semibold text-muted-foreground">{copy.mc.schedule}</div>
            <ul className="divide-y text-sm">
              {schedule.map((s) => (
                <li key={s.index} className="flex items-center gap-3 py-1.5">
                  <span className="w-8 text-right font-mono tabular-nums">{s.minute}</span>
                  <span className={`flex-1 ${s.fired ? "text-muted-foreground line-through" : ""}`}>{eventName(s.kind)}</span>
                  {s.fired ? (
                    <Check className="size-4 text-green-600" />
                  ) : (
                    due(s) && <span className="text-xs font-bold text-amber-600 uppercase">{copy.mc.dueNow}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{copy.mc.events}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            {EVENT_BUTTONS.map((kind) => {
              const on = TIMED.includes(kind) ? activeEvent(events, kind, now) : undefined;
              return (
                <div key={kind} className={`flex flex-col gap-1 rounded-lg border p-2 ${on ? "border-green-600 bg-green-50" : ""}`}>
                  <div className="text-sm font-semibold">{eventName(kind)}</div>
                  {on ? (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm tabular-nums">{formatClock(Date.parse(on.ends_at!) - now + 999)}</span>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" disabled={busy || !playing} onClick={() => fire(kind)}>
                          {copy.mc.fire}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => void run("cancel_event", { event_id: on.id })}>
                          {copy.mc.stop}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" disabled={busy || !playing} onClick={() => fire(kind)}>
                      {copy.mc.fire}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (message.trim() && (await fire("message", { text: message.trim() }))) setMessage("");
            }}
          >
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={200}
              placeholder={copy.mc.messagePlaceholder}
              className="h-11"
            />
            <Button type="submit" className="h-11" disabled={busy || !playing || !message.trim()}>
              {copy.mc.send}
            </Button>
          </form>

          <div>
            <div className="mb-1 text-sm font-semibold text-muted-foreground">{copy.mc.priceDial}</div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { dir: -1, label: copy.mc.dialDown(cfg.events.price_dial_percent), pct: -cfg.events.price_dial_percent },
                { dir: 0, label: copy.mc.dialOff, pct: null },
                { dir: 1, label: copy.mc.dialUp(cfg.events.price_dial_percent), pct: cfg.events.price_dial_percent },
              ].map((d) => (
                <Button
                  key={d.dir}
                  variant={game.price_dial_percent === d.pct ? "default" : "outline"}
                  className="h-11"
                  onClick={() => void run("set_price_dial", { direction: d.dir })}
                >
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
