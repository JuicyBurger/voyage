// The server owns the clock. We keep the difference between server and phone time.

let offsetMs = 0;
let bestRoundTrip = Infinity;

export function noteServerTime(serverNow: number, sentAt: number, receivedAt: number) {
  const roundTrip = receivedAt - sentAt;
  // Prefer the fastest round trip we have seen; it gives the most accurate offset.
  if (roundTrip <= bestRoundTrip * 1.5 || roundTrip < 300) {
    bestRoundTrip = Math.min(bestRoundTrip, roundTrip);
    offsetMs = serverNow - (sentAt + roundTrip / 2);
  }
}

export function serverNow() {
  return Date.now() + offsetMs;
}
