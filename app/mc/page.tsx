"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Crown } from "lucide-react";
import { EventBanner } from "@/components/game/event-banner";
import { GameBar } from "@/components/game/game-bar";
import { RoleGate } from "@/components/game/role-gate";
import { ActivityFeed } from "@/components/mc/activity-feed";
import { ClockControls } from "@/components/mc/clock-controls";
import { CodesCard } from "@/components/mc/codes-card";
import { EventPanel } from "@/components/mc/event-panel";
import { PaceCheck } from "@/components/mc/pace-check";
import { PostGameActions } from "@/components/mc/post-game-actions";
import { RevealControls } from "@/components/mc/reveal-controls";
import { RehearsalSwitch } from "@/components/mc/rehearsal-switch";
import { StockPosts } from "@/components/mc/stock-posts";
import { TeamsTable } from "@/components/mc/teams-table";
import { buttonVariants } from "@/components/ui/button";
import { copy } from "@/lib/copy";
import type { Identity } from "@/lib/types";
import { useGame } from "@/lib/use-game";

export default function McPage() {
  return <RoleGate role="mc">{(identity) => <McScreen identity={identity} />}</RoleGate>;
}

function McScreen({ identity }: { identity: Identity }) {
  const router = useRouter();
  const { data, connected, refresh } = useGame(identity.game_id, "all", 50);

  useEffect(() => {
    if (!data) return;
    if (data.game.status === "setup" || data.game.status === "ready") {
      router.replace("/mc/lobby");
    }
  }, [data, router]);

  if (!data) return <main className="p-6">{copy.common.loading}</main>;
  if (data.game.status === "setup" || data.game.status === "ready") {
    return <main className="p-6">{copy.common.loading}</main>;
  }

  const link = buttonVariants({ variant: "outline", className: "h-10" });
  const ended = data.game.status === "ended";

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <GameBar
        game={data.game}
        events={data.events}
        title="MC panel"
        icon={<Crown className="size-7" />}
        connected={connected}
      />
      <EventBanner events={data.events} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ClockControls game={data.game} onDone={refresh} />
          <RehearsalSwitch game={data.game} />
          <div className="flex flex-wrap gap-2">
            <Link href="/mc/setup" className={link}>
              {copy.mc.links.setup}
            </Link>
            <Link href="/mc/lobby" className={link}>
              {copy.mc.links.lobby}
            </Link>
            <Link href="/mc/qr" className={link}>
              {copy.mc.links.qr}
            </Link>
            <Link href={`/screen/${identity.game_code}`} className={link} target="_blank">
              {copy.mc.links.tv}
            </Link>
          </div>
        </div>

        {ended && (
          <>
            <RevealControls game={data.game} />
            <PostGameActions />
          </>
        )}
        <EventPanel data={data} onDone={refresh} />
        <CodesCard />
        <TeamsTable data={data} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <StockPosts data={data} />
          </div>
          <PaceCheck data={data} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <ActivityFeed data={data} />
          {!ended && <RevealControls game={data.game} />}
        </div>
      </main>
    </div>
  );
}
