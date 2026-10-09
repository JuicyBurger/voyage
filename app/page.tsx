"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { Ship } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { sendAction } from "@/lib/api";
import { copy } from "@/lib/copy";
import { continueLabel, forgetGame, listMyGames, subscribeMyGames, type MyGame } from "@/lib/my-games";
import { clearToken, getDeviceId, getToken, saveToken } from "@/lib/role-storage";

const EMPTY_GAMES: MyGame[] = [];

export default function Home() {
  const router = useRouter();
  const games = useSyncExternalStore(subscribeMyGames, listMyGames, () => EMPTY_GAMES);
  const token = useSyncExternalStore(subscribeMyGames, getToken, () => null);

  // Drop saved logins whose tokens no longer work (ended / rotated games).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const g of listMyGames()) {
        const res = await sendAction("whoami", { device_id: getDeviceId() }, { token: g.token });
        if (cancelled) return;
        if (!res.ok) {
          forgetGame(g.token);
          if (getToken() === g.token) clearToken();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const continueSaved = useCallback(
    async (g: MyGame) => {
      const res = await sendAction("whoami", { device_id: getDeviceId() }, { token: g.token });
      if (!res.ok || !res.state) {
        forgetGame(g.token);
        if (getToken() === g.token) clearToken();
        router.push(`/join?code=${encodeURIComponent(g.code)}`);
        return;
      }
      saveToken(g.token);
      router.push(`/join/${g.token}`);
    },
    [router],
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <Ship className="size-16" />
      <h1 className="text-4xl font-bold">{copy.landing.title}</h1>
      <p className="max-w-sm text-lg text-muted-foreground">{copy.landing.body}</p>

      <div className="flex w-full flex-col gap-3">
        <Link href="/join" className={buttonVariants({ className: "h-14 w-full text-lg font-bold" })}>
          {copy.landing.join}
        </Link>
        <Link
          href="/host"
          className={buttonVariants({ variant: "outline", className: "h-14 w-full text-lg font-bold" })}
        >
          {copy.landing.host}
        </Link>
        {token && (
          <Link href={`/join/${token}`} className={buttonVariants({ variant: "secondary", className: "h-12 w-full text-base" })}>
            {copy.landing.continue}
          </Link>
        )}
      </div>

      <section className="w-full text-left">
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase">{copy.landing.myGames}</h2>
        {games.length === 0 ? (
          <p className="text-sm text-muted-foreground">{copy.landing.noSaved}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {games.map((g) => (
              <li key={g.token} className="flex items-stretch gap-2">
                <Button className="h-12 flex-1 justify-start text-base" onClick={() => void continueSaved(g)}>
                  {continueLabel(g)}
                </Button>
                <Button
                  variant="outline"
                  className="h-12 px-3"
                  onClick={() => forgetGame(g.token)}
                >
                  {copy.landing.forget}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
