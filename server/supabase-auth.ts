export type PortalRole = "user" | "admin";
export type SupabaseIdentity = {
  email: string;
  emailVerified: boolean;
  /** Read from the portal database with the user's own token (RLS), never from token metadata. */
  portalRole: PortalRole;
  accountStatus: string;
  name?: string;
};
export type SupabaseVerifier = (
  accessToken: string,
) => Promise<SupabaseIdentity>;

/**
 * Verifies a Supabase access token against the company's own Supabase project
 * and reads the portal role and account status with that same token, so row-level
 * security decides what it can see. Needs only the public (publishable) key.
 */
export function supabaseVerifier(
  url: string,
  publishableKey: string,
): SupabaseVerifier {
  const base = url.replace(/\/+$/, "");
  const get = async (path: string, token: string) => {
    const response = await fetch(`${base}${path}`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`supabase ${response.status}`);
    return response.json();
  };
  return async (accessToken) => {
    const user = (await get("/auth/v1/user", accessToken)) as {
      id?: string;
      email?: string;
      email_confirmed_at?: string | null;
    };
    if (!user.id || !user.email) throw new Error("no user");
    const id = encodeURIComponent(user.id);
    // Role and status live on the same profiles row; the user's own token reads it (RLS).
    const profiles = (await get(
      `/rest/v1/profiles?id=eq.${id}&select=role,account_status,full_name`,
      accessToken,
    )) as {
      role?: PortalRole;
      account_status?: string;
      full_name?: string | null;
    }[];
    return {
      email: user.email,
      emailVerified: Boolean(user.email_confirmed_at),
      portalRole: profiles[0]?.role ?? "user",
      accountStatus: profiles[0]?.account_status ?? "unknown",
      name: profiles[0]?.full_name || undefined,
    };
  };
}
