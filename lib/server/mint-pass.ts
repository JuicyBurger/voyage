import "server-only";
import { importJWK, SignJWT, type JWK, type KeyLike } from "jose";

export type PassClaims = {
  sub: string;
  game_id: string;
  vc_role: "mc" | "team" | "post" | "tv";
  team_id: string | null;
  post_id: string | null;
};

const MAX_TTL = 7200;

type SigningJwk = JWK & { alg?: string; kid?: string };

function loadJwk(): SigningJwk {
  const raw = process.env.SUPABASE_JWT_SIGNING_KEY;
  if (!raw) throw new Error("SUPABASE_JWT_SIGNING_KEY is not set");
  const parsed = JSON.parse(raw) as SigningJwk | SigningJwk[];
  const jwk = Array.isArray(parsed) ? parsed[0]! : parsed;
  // jose only needs crypto fields; drop use/key_ops/ext from gen signing-key output.
  const clean: SigningJwk = {
    kty: jwk.kty,
    crv: jwk.crv,
    x: jwk.x,
    y: jwk.y,
    d: jwk.d,
    n: jwk.n,
    e: jwk.e,
    k: jwk.k,
  };
  if (jwk.alg) clean.alg = jwk.alg;
  if (jwk.kid) clean.kid = jwk.kid;
  return clean;
}

let keyPromise: Promise<{ key: KeyLike | Uint8Array; alg: string; kid?: string }> | null = null;

function signingKey() {
  if (!keyPromise) {
    keyPromise = (async () => {
      const jwk = loadJwk();
      const alg = jwk.alg ?? "ES256";
      const key = await importJWK(jwk, alg);
      return { key, alg, kid: jwk.kid };
    })();
  }
  return keyPromise;
}

/** Mint a short-lived read pass. ttl_seconds may only shorten (≤ 2h). */
export async function mintReadPass(claims: PassClaims, ttlSeconds = MAX_TTL) {
  const ttl = Math.min(Math.max(1, Math.floor(ttlSeconds)), MAX_TTL);
  const { key, alg, kid } = await signingKey();
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const header: { alg: string; typ: string; kid?: string } = { alg, typ: "JWT" };
  if (kid) header.kid = kid;

  const pass = await new SignJWT({
    role: "authenticated",
    game_id: claims.game_id,
    vc_role: claims.vc_role,
    team_id: claims.team_id,
    post_id: claims.post_id,
  })
    .setProtectedHeader(header)
    .setSubject(claims.sub)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(key);

  return { pass, exp, ttl };
}
