/**
 * Hands a verified portal administrator over to the company workspace. The server checks the
 * Supabase token and the administrator role itself, then sets the workspace session cookie.
 */
export async function enterWorkspace(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch("/api/login/supabase", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
