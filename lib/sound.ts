// Short beeps from the Web Audio API. Browsers only allow sound after a tap,
// so unlockSound() is called from the "Start" button.

let ctx: AudioContext | null = null;

export function unlockSound() {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    beep(660, 0.08, 0.05);
  } catch {
    // no sound on this phone
  }
}

export function beep(freq = 880, seconds = 0.15, volume = 0.2) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.value = freq;
  osc.type = "square";
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
  osc.connect(gain).connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + seconds);
}

export function playTune(notes: [freq: number, ms: number][]) {
  let at = 0;
  for (const [freq, ms] of notes) {
    setTimeout(() => beep(freq, ms / 1000), at);
    at += ms;
  }
}

export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}
