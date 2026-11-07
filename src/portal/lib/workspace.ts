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

/** Ends the company workspace session too, so signing out here really signs out everywhere. */
export async function leaveWorkspace(): Promise<void> {
  try {
    const status = (await (
      await fetch("/api/session", { credentials: "same-origin" })
    ).json()) as { csrf: string | null };
    if (!status.csrf) return;
    await fetch("/api/logout", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": status.csrf,
      },
      body: "{}",
    });
  } catch {
    // Offline or already signed out; the workspace session expires on its own.
  }
}
