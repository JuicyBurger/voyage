import type { Role } from "./types";

const KEY = "vc_my_games";
const MAX = 10;
export const MY_GAMES_EVENT = "vc-my-games";

export type MyGame = {
  code: string;
  game_name: string;
  role: Role;
  label: string;
  token: string;
  saved_at: number;
};

let cacheRaw: string | null = null;
let cacheList: MyGame[] = [];

function read(): MyGame[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY) ?? "[]";
    if (raw === cacheRaw) return cacheList;
    const parsed = JSON.parse(raw) as MyGame[];
    const list = Array.isArray(parsed) ? parsed : [];
    cacheRaw = raw;
    cacheList = [...list].sort((a, b) => b.saved_at - a.saved_at);
    return cacheList;
  } catch {
    cacheRaw = "[]";
    cacheList = [];
    return cacheList;
  }
}

function write(list: MyGame[]) {
  const next = list.slice(0, MAX);
  const raw = JSON.stringify(next);
  localStorage.setItem(KEY, raw);
  cacheRaw = raw;
  cacheList = [...next].sort((a, b) => b.saved_at - a.saved_at);
  window.dispatchEvent(new Event(MY_GAMES_EVENT));
}

export function subscribeMyGames(cb: () => void) {
  window.addEventListener(MY_GAMES_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(MY_GAMES_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

export function listMyGames(): MyGame[] {
  return read();
}

export function rememberGame(entry: Omit<MyGame, "saved_at">) {
  const next = [
    { ...entry, saved_at: Date.now() },
    ...read().filter(
      (g) => g.token !== entry.token && !(g.code === entry.code && g.role === entry.role && g.label === entry.label),
    ),
  ];
  write(next);
}

export function forgetGame(token: string) {
  write(read().filter((g) => g.token !== token));
}

export function continueLabel(g: MyGame) {
  return `Continue as ${g.label} (${g.code})`;
}
