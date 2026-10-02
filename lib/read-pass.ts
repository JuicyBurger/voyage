"use client";

import { sendAction } from "./api";

type PassMode = { kind: "role"; token: string } | { kind: "tv"; code: string };

type PassOk = { ok: true; pass: string; exp: number; game_id?: string };
type PassFail = { ok: false; error_code?: string; args?: Record<string, unknown> };

const REFRESH_SKEW_MS = 10 * 60 * 1000;

let mode: PassMode | null = null;
let pass: string | null = null;
let expMs = 0;
let inflight: Promise<PassOk | PassFail> | null = null;

export function clearReadPass() {
  mode = null;
  pass = null;
  expMs = 0;
  inflight = null;
}

export function currentReadPass() {
  return pass;
}

async function applyRolePass(token: string): Promise<PassOk | PassFail> {
  const res = await sendAction<{ pass: string; exp: number }>("get_pass", {}, { token });
  if (!res.ok || !res.state?.pass) {
    return { ok: false, error_code: res.error_code, args: res.args };
  }
  pass = res.state.pass;
  expMs = res.state.exp * 1000;
  return { ok: true, pass: pass!, exp: res.state.exp };
}

async function applyTvPass(code: string): Promise<PassOk | PassFail> {
  const res = await sendAction<{ pass: string; exp: number; game_id: string }>(
    "tv_pass",
    { code },
    { token: null },
  );
  if (!res.ok || !res.state?.pass) {
    return { ok: false, error_code: res.error_code, args: res.args };
  }
  pass = res.state.pass;
  expMs = res.state.exp * 1000;
  return { ok: true, pass: pass!, exp: res.state.exp, game_id: res.state.game_id };
}

async function refresh(): Promise<PassOk | PassFail> {
  if (!mode) return { ok: false, error_code: "BAD_TOKEN" };
  if (mode.kind === "role") return applyRolePass(mode.token);
  return applyTvPass(mode.code);
}

/** Supabase accessToken callback: returns the bearer pass, refreshing near expiry. */
export async function getAccessToken(): Promise<string | null> {
  if (pass && Date.now() < expMs - REFRESH_SKEW_MS) return pass;
  if (!mode) return pass;
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  const res = await inflight;
  return res.ok ? res.pass : pass;
}

export async function ensureRolePass(token: string): Promise<PassOk | PassFail> {
  mode = { kind: "role", token };
  if (pass && Date.now() < expMs - REFRESH_SKEW_MS) {
    return { ok: true, pass, exp: Math.floor(expMs / 1000) };
  }
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function ensureTvPass(code: string): Promise<PassOk | PassFail> {
  mode = { kind: "tv", code: code.toUpperCase() };
  if (!inflight) {
    inflight = refresh().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

/** Force a refresh (visibility / reconnect). */
export async function refreshReadPass(): Promise<PassOk | PassFail> {
  if (!mode) return { ok: false, error_code: "BAD_TOKEN" };
  inflight = null;
  return refresh();
}
