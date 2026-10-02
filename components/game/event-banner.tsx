"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { bannerFor, type Banner } from "@/lib/copy";
import { serverNow } from "@/lib/server-time";
import { playTune, vibrate } from "@/lib/sound";
import type { WorldEvent } from "@/lib/types";

const SHOW_MS = 3000;
const MAX_AGE_MS = 15000;

const TONE_BG: Record<Banner["tone"], string> = {
  good: "#15803d",
  bad: "#7f1d1d",
  info: "#1e3a8a",
};

// Shows a full-screen banner for 3 seconds when a new world event arrives.
// Events that already existed when the page loaded are not replayed.
export function EventBanner({ events }: { events: WorldEvent[] }) {
  const seen = useRef<Set<string> | null>(null);
  const [queue, setQueue] = useState<{ id: string; banner: Banner }[]>([]);

  useEffect(() => {
    if (seen.current === null) {
      seen.current = new Set(events.map((e) => e.id));
      return;
    }
    // A phone waking from sleep should not replay old banners.
    const recent = serverNow() - MAX_AGE_MS;
    const fresh = events
      .filter((e) => !seen.current!.has(e.id) && !e.cancelled_at && Date.parse(e.created_at) > recent)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (!fresh.length) return;
    for (const e of fresh) seen.current.add(e.id);
    const items = fresh.flatMap((e) => {
      const banner = bannerFor(e);
      return banner ? [{ id: e.id, banner }] : [];
    });
    if (items.length) setQueue((q) => [...q, ...items]);
  }, [events]);

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    if (current.banner.big) {
      playTune([[523, 150], [659, 150], [784, 150], [1047, 400]]);
      void import("canvas-confetti").then(({ default: confetti }) => {
        confetti({ particleCount: 160, spread: 100, origin: { y: 0.6 }, zIndex: 9999 });
      });
    } else {
      playTune([[880, 120], [660, 200]]);
    }
    vibrate([200, 100, 200]);
    const id = setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS);
    return () => clearTimeout(id);
  }, [current]);

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          key={current.id}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-8 text-center text-white"
          style={{ background: TONE_BG[current.banner.tone] }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => setQueue((q) => q.slice(1))}
        >
          <motion.h2
            className="text-5xl font-black tracking-tight sm:text-7xl"
            initial={{ y: 20 }}
            animate={{ y: 0 }}
          >
            {current.banner.title}
          </motion.h2>
          <p className="max-w-xl text-2xl font-semibold sm:text-3xl">{current.banner.body}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
