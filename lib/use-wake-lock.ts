"use client";

import { useEffect } from "react";

type Sentinel = { release: () => Promise<void> };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: "screen") => Promise<Sentinel> } };

let sentinel: Sentinel | null = null;

export async function requestWakeLock() {
  const nav = navigator as WakeLockNav;
  if (!nav.wakeLock || sentinel) return;
  try {
    sentinel = await nav.wakeLock.request("screen");
    (sentinel as unknown as EventTarget).addEventListener?.("release", () => {
      sentinel = null;
    });
  } catch {
    // Not allowed or not supported (e.g. http on a phone). Stay quiet.
  }
}

// The browser drops the wake lock when the tab is hidden, so ask again when it comes back.
export function useWakeLock() {
  useEffect(() => {
    void requestWakeLock();
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
}
