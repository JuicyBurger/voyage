"use client";

import { useEffect, useState } from "react";
import { serverNow } from "./server-time";

// Server time, updated a few times per second.
export function useNow(intervalMs = 250) {
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    if (intervalMs <= 0) return;
    const id = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
