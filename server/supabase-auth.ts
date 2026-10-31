import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

/** Who Supabase says signed in. It does not say whether KIT lets them in. */
export type SupabaseIdentity = {
  userId: string;
  email?: string;
  emailVerified: boolean;
};
export type SupabaseVerifier = (
  accessToken: string,
) => Promise<SupabaseIdentity>;

/** A row of `public.profiles` plus its grants, as `public.kit_account` returns it. */
export type SupabaseAccount = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  status: "pending" | "active" | "disabled";
  isOwner: boolean;
  clientId: string | null;
  eventIds: string[];
  sharedProposalIds: string[];
  /** Set when the account came from the registration directory listing. */
  createdAt?: string;
};
export type SupabaseAccountReader = (
  userId: string,
) => Promise<SupabaseAccount | null>;

export class SupabaseAuthError extends Error {}

const decode = (part: string) => Buffer.from(part, "base64url");
const json = (part: string) =>
  JSON.parse(decode(part).toString("utf8")) as Record<string, unknown>;

/** Seconds of clock skew tolerated on `exp`, `iat` and `nbf`. */
const LEEWAY = 60;

type Jwks = { keys: Record<string, unknown>[] };

/**
 * Fetches and caches the project's public signing keys. Supabase rotates them,
 * so an unknown `kid` refetches once, no more often than every `MIN_REFRESH`.
 */
function jwksCache(baseUrl: string, fetchImpl: typeof fetch) {
  const MIN_REFRESH = 30_000;
  let keys = new Map<string, KeyObject>();
  let fetchedAt = 0;
  let inFlight: Promise<void> | null = null;
  const load = async () => {
    const response = await fetchImpl(
      `${baseUrl}/auth/v1/.well-known/jwks.json`,
    );
    if (!response.ok)
      throw new SupabaseAuthError(
        `The signing keys could not be read (${response.status}).`,
      );
    const body = (await response.json()) as Jwks;
    const next = new Map<string, KeyObject>();
    for (const jwk of body.keys || []) {
      const kid = typeof jwk.kid === "string" ? jwk.kid : "";
      if (!kid) continue;
      try {
        next.set(kid, createPublicKey({ key: jwk as never, format: "jwk" }));
      } catch {
        // An unusable key is skipped rather than failing every verification.
      }
    }
    keys = next;
    fetchedAt = Date.now();
  };
  return async (kid: string) => {
    const cached = keys.get(kid);
    if (cached) return cached;
    if (Date.now() - fetchedAt < MIN_REFRESH && keys.size)
      throw new SupabaseAuthError("The token was signed by an unknown key.");
    inFlight ||= load().finally(() => {
      inFlight = null;
    });
    await inFlight;
    const key = keys.get(kid);
    if (!key)
      throw new SupabaseAuthError("The token was signed by an unknown key.");
    return key;
  };
}

function checkClaims(claims: Record<string, unknown>, issuer: string) {
  const now = Math.floor(Date.now() / 1000);
  const number = (value: unknown) =>
    typeof value === "number" ? value : undefined;
  const exp = number(claims.exp);
  const iat = number(claims.iat);
  const nbf = number(claims.nbf);
  if (exp === undefined || exp + LEEWAY < now)
    throw new SupabaseAuthError("The session has expired. Sign in again.");
  if (iat !== undefined && iat - LEEWAY > now)
    throw new SupabaseAuthError("The token is not valid yet.");
  if (nbf !== undefined && nbf - LEEWAY > now)
    throw new SupabaseAuthError("The token is not valid yet.");
  if (claims.iss !== issuer)
    throw new SupabaseAuthError("The token came from another project.");
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience.includes("authenticated"))
    throw new SupabaseAuthError("The token is not an end-user session.");
  if (typeof claims.sub !== "string" || !claims.sub)
    throw new SupabaseAuthError("The token has no account identifier.");
  return claims;
}

function identityOf(claims: Record<string, unknown>): SupabaseIdentity {
  const email = typeof claims.email === "string" ? claims.email : undefined;
  // Supabase reports confirmation either as a timestamp or a boolean claim.
  const metadata =
    (claims.user_metadata as Record<string, unknown> | undefined) || {};
  const verified =
    claims.email_verified === true ||
    metadata.email_verified === true ||
    typeof claims.email_confirmed_at === "string";
  return { userId: claims.sub as string, email, emailVerified: verified };
}

/**
 * Verifies a Supabase access token locally.
 *
 * Asymmetric projects (ES256/RS256) are verified against the published JWKS.
 * Projects still on the legacy shared secret are verified with HS256 and need
 * no network access at all, which is what the tests use.
 */
export function supabaseVerifier(
  projectUrl: string,
  options: {
    jwtSecret?: string;
    fetchImpl?: typeof fetch;
  } = {},
): SupabaseVerifier {
  const baseUrl = projectUrl.replace(/\/+$/, "");
  const issuer = `${baseUrl}/auth/v1`;
  const publicKey = jwksCache(baseUrl, options.fetchImpl || fetch);
  return async (accessToken) => {
    const parts = accessToken.split(".");
    if (parts.length !== 3)
      throw new SupabaseAuthError("The token is malformed.");
    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    let header: Record<string, unknown>;
    let claims: Record<string, unknown>;
    try {
      header = json(encodedHeader);
      claims = json(encodedPayload);
    } catch {
      throw new SupabaseAuthError("The token could not be read.");
    }
    const signed = Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8");
    const signature = decode(encodedSignature);
    const alg = header.alg;
    if (alg === "HS256") {
      if (!options.jwtSecret)
        throw new SupabaseAuthError(
          "This project signs tokens with a shared secret, but SUPABASE_JWT_SECRET is not set.",
        );
      const expected = createHmac("sha256", options.jwtSecret)
        .update(signed)
        .digest();
      if (
        signature.length !== expected.length ||
        !timingSafeEqual(signature, expected)
      )
        throw new SupabaseAuthError("The token signature does not match.");
    } else if (alg === "RS256" || alg === "ES256") {
      const kid = typeof header.kid === "string" ? header.kid : "";
      if (!kid) throw new SupabaseAuthError("The token has no key identifier.");
      const key = await publicKey(kid);
      const ok = verifySignature(
        "sha256",
        signed,
        alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key,
        signature,
      );
      if (!ok) throw new SupabaseAuthError("The token signature does not match.");
    } else {
      // Never trust `alg: none`, and never guess at an algorithm we cannot check.
      throw new SupabaseAuthError(
        `Tokens signed with ${String(alg)} are not accepted.`,
      );
    }
    return identityOf(checkClaims(claims, issuer));
  };
}

/** The registration queue an administrator reviews. */
export type SupabaseDirectory = {
  list: () => Promise<SupabaseAccount[]>;
  setAccess: (
    userId: string,
    patch: { role?: string | null; status?: string; approvedBy?: string },
  ) => Promise<void>;
};

const PROFILE_COLUMNS =
  "id,email,name,role,status,is_owner,client_id,created_at,approved_at";

type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  status: SupabaseAccount["status"];
  is_owner: boolean;
  client_id: string | null;
  created_at?: string;
  approved_at?: string | null;
};

const fromRow = (row: ProfileRow): SupabaseAccount => ({
  id: row.id,
  email: row.email,
  name: row.name,
  role: row.role,
  status: row.status,
  isOwner: row.is_owner,
  clientId: row.client_id,
  eventIds: [],
  sharedProposalIds: [],
  createdAt: row.created_at,
});

/**
 * Lists and updates registrations with the service-role key. Every caller is
 * authorized by KIT first; this only carries out what an administrator asked
 * for. Server-only: the service-role key must never reach the browser.
 */
export function supabaseDirectory(
  projectUrl: string,
  serviceRoleKey: string,
  fetchImpl: typeof fetch = fetch,
): SupabaseDirectory {
  const baseUrl = projectUrl.replace(/\/+$/, "");
  const call = async (path: string, init: RequestInit) => {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        ...init.headers,
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new SupabaseAuthError(
        `The account directory refused the request (${response.status}).`,
      );
    return response;
  };
  return {
    async list() {
      const response = await call(
        `profiles?select=${PROFILE_COLUMNS}&order=created_at.desc`,
        { method: "GET" },
      );
      return ((await response.json()) as ProfileRow[]).map(fromRow);
    },
    async setAccess(userId, patch) {
      const body: Record<string, unknown> = {};
      if (patch.role !== undefined) body.role = patch.role;
      if (patch.status !== undefined) body.status = patch.status;
      if (patch.status === "active") {
        body.approved_at = new Date().toISOString();
        if (patch.approvedBy) body.approved_by = patch.approvedBy;
      }
      await call(`profiles?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify(body),
      });
    },
  };
}

/**
 * Reads a KIT account from Supabase with the service-role key, so the role and
 * approval status come from the database rather than from the client's token.
 * Server-only: this key must never reach the browser.
 */
export function supabaseAccountReader(
  projectUrl: string,
  serviceRoleKey: string,
  fetchImpl: typeof fetch = fetch,
): SupabaseAccountReader {
  const baseUrl = projectUrl.replace(/\/+$/, "");
  return async (userId) => {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/kit_account`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ account_id: userId }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new SupabaseAuthError(
        `The account could not be read (${response.status}).`,
      );
    const account = (await response.json()) as SupabaseAccount | null;
    return account && account.id ? account : null;
  };
}
