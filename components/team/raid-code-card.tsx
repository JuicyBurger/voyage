"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendAction } from "@/lib/api";
import { copy } from "@/lib/copy";
import type { Team } from "@/lib/types";

// The team's own 4-digit code, hidden behind a tap. The code changes after every raid.
export function RaidCodeCard({ team, accent }: { team: Team; accent: string }) {
  const [shown, setShown] = useState(false);
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    if (!shown) return;
    let alive = true;
    void sendAction<{ code: string }>("get_my_raid_code").then((res) => {
      if (alive && res.ok && res.state) setCode(res.state.code);
    });
    return () => {
      alive = false;
    };
  }, [shown, team.times_raided]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <KeyRound className="size-5" /> {copy.team.myCode}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <p className="text-center text-sm text-muted-foreground">{copy.team.codeHint}</p>
        {shown ? (
          <>
            <div className="font-mono text-6xl font-black tracking-[0.3em] tabular-nums" style={{ color: accent }}>
              {code ?? "····"}
            </div>
            <Button variant="outline" className="h-12 w-full text-base" onClick={() => setShown(false)}>
              {copy.team.hideCode}
            </Button>
          </>
        ) : (
          <Button className="h-14 w-full text-lg font-bold text-white" style={{ background: accent }} onClick={() => setShown(true)}>
            {copy.team.showCode}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
