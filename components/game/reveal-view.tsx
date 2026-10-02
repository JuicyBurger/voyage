"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Crown } from "lucide-react";
import { teamColor } from "@/lib/colors";
import { RehearsalMark } from "@/components/game/game-bar";
import { copy } from "@/lib/copy";
import { playTune, vibrate } from "@/lib/sound";
import type { Game, Score } from "@/lib/types";

// The final ranking, shown from last place to first as the MC taps Next.
// `big` is the TV layout. `me` highlights a team on its own phone.
export function RevealView({ game, big = false, me }: { game: Game; big?: boolean; me?: string }) {
  const scores = (game.final_scores as Score[] | null) ?? [];
  const step = game.reveal_step ?? 0;
  const total = scores.length;
  const shown = scores.filter((s) => s.place > total - step);
  const done = total > 0 && step >= total;
  const winner = scores.find((s) => s.place === 1);

  const celebrated = useRef(false);
  useEffect(() => {
    if (!done || celebrated.current) return;
    celebrated.current = true;
    playTune([[523, 150], [659, 150], [784, 150], [1047, 500]]);
    vibrate([200, 100, 200, 100, 400]);
    void import("canvas-confetti").then(({ default: confetti }) => {
      const burst = (x: number) => confetti({ particleCount: 140, spread: 90, origin: { x, y: 0.6 }, zIndex: 9999 });
      burst(0.2);
      burst(0.8);
      setTimeout(() => burst(0.5), 400);
    });
  }, [done]);

  return (
    <div className={`flex w-full flex-col items-center gap-4 ${big ? "max-w-4xl" : "max-w-md"}`}>
      {game.rehearsal && <div className="w-full"><RehearsalMark /></div>}
      <h2 className={`text-center font-black tracking-tight ${big ? "text-7xl" : "text-4xl"}`}>{copy.reveal.title}</h2>
      {done && winner ? (
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 12 }}
          className={`flex items-center gap-3 font-black text-yellow-300 ${big ? "text-6xl" : "text-3xl"}`}
        >
          <Crown className={big ? "size-16" : "size-9"} /> {copy.reveal.winner(winner.name)}
        </motion.div>
      ) : (
        <p className={`text-center font-semibold opacity-80 ${big ? "text-3xl" : "text-xl"}`}>{copy.reveal.waiting}</p>
      )}

      <div className="flex w-full flex-col gap-3">
        <AnimatePresence initial={false}>
          {shown.map((s) => {
            const c = teamColor(s.color);
            return (
              <motion.div
                key={s.team_id}
                layout
                initial={{ opacity: 0, y: -40, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                className={`flex items-center gap-4 rounded-2xl px-5 text-white shadow-lg ${big ? "py-5" : "py-3"} ${
                  me === s.team_id ? "ring-4 ring-yellow-300" : ""
                }`}
                style={{ background: c.bg }}
              >
                <div className={`shrink-0 font-black ${big ? "w-32 text-5xl" : "w-16 text-2xl"}`}>{copy.scores.place(s.place)}</div>
                <div className="min-w-0 flex-1">
                  <div className={`truncate font-extrabold ${big ? "text-4xl" : "text-xl"}`}>{s.name}</div>
                  <div className={`opacity-90 ${big ? "text-xl" : "text-sm"}`}>{copy.scores.breakdown(s)}</div>
                </div>
                <div className="text-right">
                  <div className={`font-black tabular-nums ${big ? "text-6xl" : "text-3xl"}`}>{s.total}</div>
                  <div className="text-xs uppercase opacity-80">{copy.scores.points}</div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Full-screen cover for team and post phones while the reveal runs.
export function RevealOverlay({ game, me }: { game: Game; me?: string }) {
  if (game.reveal_step === null) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center overflow-y-auto bg-slate-900 p-5 pt-10 text-white">
      <RevealView game={game} me={me} />
    </div>
  );
}
