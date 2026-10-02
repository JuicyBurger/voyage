"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Dice1, Dice2, Dice3, Dice4, Dice5, Dice6, Shield } from "lucide-react";
import { teamColor } from "@/lib/colors";
import { copy } from "@/lib/copy";
import { beep, playTune, vibrate } from "@/lib/sound";

const FACES = [Dice1, Dice2, Dice3, Dice4, Dice5, Dice6];
const ROLL_MS = 1800;

export type DiceSide = { name: string; color: string; die: number | null; bonus: number };

function randomFace() {
  return 1 + Math.floor(Math.random() * 6);
}

// Two dice that tumble for about 2 seconds, then show the server's roll.
// `good` is from the viewer's side and picks the sound. Children show after the roll.
export function RaidDice({
  attacker,
  defender,
  blocked,
  good,
  children,
}: {
  attacker: DiceSide;
  defender: DiceSide;
  blocked: boolean;
  good: boolean;
  children: React.ReactNode;
}) {
  const [rolling, setRolling] = useState(true);
  const [faces, setFaces] = useState([randomFace(), randomFace()]);

  useEffect(() => {
    const spin = blocked
      ? null
      : setInterval(() => {
          setFaces([randomFace(), randomFace()]);
          beep(250 + Math.random() * 300, 0.03, 0.05);
        }, 90);
    const stop = setTimeout(
      () => {
        if (spin) clearInterval(spin);
        setRolling(false);
        if (good) playTune([[523, 120], [659, 120], [784, 240]]);
        else playTune([[392, 160], [330, 160], [262, 300]]);
        vibrate(good ? [80, 40, 80] : 300);
      },
      blocked ? 900 : ROLL_MS,
    );
    return () => {
      if (spin) clearInterval(spin);
      clearTimeout(stop);
    };
  }, [blocked, good]);

  const attTotal = (attacker.die ?? 0) + attacker.bonus;
  const defTotal = (defender.die ?? 0) + defender.bonus;
  const attWon = attTotal > defTotal;

  return (
    <div className="flex flex-col items-center gap-5">
      {blocked ? (
        <motion.div
          initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 14 }}
        >
          <Shield className="size-32 text-sky-600" strokeWidth={1.5} />
        </motion.div>
      ) : (
        <div className="grid w-full grid-cols-2 gap-4">
          {[attacker, defender].map((side, i) => {
            const c = teamColor(side.color);
            const face = rolling ? faces[i] : (side.die ?? 1);
            const Face = FACES[face - 1];
            const total = i === 0 ? attTotal : defTotal;
            const winner = !rolling && (i === 0 ? attWon : !attWon);
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                <div className="text-base font-bold" style={{ color: c.bg }}>
                  {side.name}
                </div>
                <motion.div
                  animate={
                    rolling
                      ? { rotate: [0, -15, 15, -10, 10, 0], y: [0, -8, 0] }
                      : { rotate: 0, y: 0, scale: winner ? 1.15 : 0.9 }
                  }
                  transition={rolling ? { duration: 0.35, repeat: Infinity } : { type: "spring", stiffness: 300, damping: 15 }}
                >
                  <Face className="size-24" style={{ color: c.bg }} strokeWidth={1.5} />
                </motion.div>
                {side.bonus > 0 && <div className="text-sm font-semibold">{copy.raid.sword(side.bonus)}</div>}
                {!rolling && (
                  <div className={`text-3xl font-black tabular-nums ${winner ? "" : "opacity-40"}`}>{total}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {rolling ? (
        <div className="text-lg font-semibold text-muted-foreground">{copy.raid.rolling}</div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full text-center">
          {children}
        </motion.div>
      )}
    </div>
  );
}
