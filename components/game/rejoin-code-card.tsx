"use client";

import { useEffect, useState } from "react";
import { Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sendAction } from "@/lib/api";
import { copy } from "@/lib/copy";

// Hidden by default so other players cannot read the PIN off the screen.
export function RejoinCodeCard({ accent }: { accent?: string }) {
  const [shown, setShown] = useState(false);
  const [line, setLine] = useState<string | null>(null);

  useEffect(() => {
    if (!shown) return;
    let alive = true;
    void sendAction<{ code: string; pin: string }>("get_my_rejoin").then((res) => {
      if (!alive || !res.ok || !res.state) return;
      setLine(copy.codes.rejoinLine(res.state.code, res.state.pin));
    });
    return () => {
      alive = false;
    };
  }, [shown]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Ticket className="size-5" /> {copy.codes.rejoin}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        {shown ? (
          <>
            <div className="text-center font-mono text-2xl font-black tracking-wide" style={{ color: accent }}>
              {line ?? "…"}
            </div>
            <Button variant="outline" className="h-12 w-full text-base" onClick={() => setShown(false)}>
              {copy.codes.rejoinHide}
            </Button>
          </>
        ) : (
          <Button
            className="h-14 w-full text-lg font-bold"
            style={accent ? { background: accent, color: "#fff" } : undefined}
            onClick={() => setShown(true)}
          >
            {copy.codes.rejoinShow}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
