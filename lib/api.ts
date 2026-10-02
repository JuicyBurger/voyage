import type { ApiResult } from "./types";
import { getToken, uuid } from "./role-storage";
import { noteServerTime } from "./server-time";

type SendOptions = {
  token?: string | null;
  hostPassword?: string;
  actionId?: string;
  /** Test-only: override the client IP seen by rate limits. */
  forwardedFor?: string;
};

// Sends one write to /api/action. The same action_id is reused on retry,
// so the server never applies a double tap or a retried request twice.
export async function sendAction<S = Record<string, unknown>>(
  type: string,
  input: Record<string, unknown> = {},
  opts: SendOptions = {},
): Promise<ApiResult<S>> {
  const action_id = opts.actionId ?? uuid();
  const token = opts.token === undefined ? getToken() : opts.token;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers["x-role-token"] = token;
  if (opts.hostPassword) headers["x-host-password"] = opts.hostPassword;
  if (opts.forwardedFor) headers["x-forwarded-for"] = opts.forwardedFor;

  for (let attempt = 0; attempt < 3; attempt++) {
    const sentAt = Date.now();
    try {
      const res = await fetch("/api/action", {
        method: "POST",
        headers,
        body: JSON.stringify({ type, action_id, ...input }),
        cache: "no-store",
      });
      const data = (await res.json()) as ApiResult<S>;
      if (typeof data.server_now === "number") noteServerTime(data.server_now, sentAt, Date.now());
      return data;
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  return { ok: false, error_code: "NETWORK", server_now: Date.now() };
}
