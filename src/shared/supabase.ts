const env = import.meta.env;
const url = (env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || "";
export const supabaseEnabled = Boolean(url && key);

/**
 * KIT keeps its own server session, so a Supabase session is only ever used
 * once: the access token is exchanged at POST /api/login/supabase and then
 * discarded. Nothing is persisted in the browser, which is why this talks to
 * the auth endpoints directly instead of carrying a client library.
 */
async function auth<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${url}/auth/v1/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: key },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => null)) as
    | (T & {
        error?: string;
        error_description?: string;
        msg?: string;
        code?: string;
      })
    | null;
  if (!response.ok || !result) {
    const detail =
      result?.error_description || result?.msg || result?.error || "";
    throw new SupabaseSignInError(detail, result?.code || "", response.status);
  }
  return result;
}

export class SupabaseSignInError extends Error {
  constructor(
    detail: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(detail);
  }
}

type SignUpResponse = {
  // Present only when the project does not require email confirmation.
  access_token?: string;
  user?: { id: string; email: string; confirmation_sent_at?: string };
  id?: string;
  email?: string;
  confirmation_sent_at?: string;
};

export type SignUpOutcome =
  | { kind: "confirm-email"; email: string }
  | { kind: "signed-in"; accessToken: string };

/**
 * Registers an account. The database trigger creates it as `pending` with no
 * role, so a new registration never grants itself access to the workspace.
 */
export async function supabaseSignUp(
  email: string,
  password: string,
  name: string,
): Promise<SignUpOutcome> {
  const result = await auth<SignUpResponse>("signup", {
    email,
    password,
    data: { name },
  });
  if (result.access_token)
    return { kind: "signed-in", accessToken: result.access_token };
  return { kind: "confirm-email", email: result.user?.email || email };
}

export async function supabaseSignIn(email: string, password: string) {
  const result = await auth<{ access_token: string }>(
    "token?grant_type=password",
    { email, password },
  );
  return result.access_token;
}

export async function supabaseResendConfirmation(email: string) {
  await auth("resend", { type: "signup", email });
}

export async function supabasePasswordReset(email: string) {
  await auth("recover", { email });
}

/** Supabase reports its own failures in English; these are the ones users hit. */
export function supabaseMessage(error: unknown): string {
  if (!(error instanceof SupabaseSignInError))
    return "No se pudo conectar con el servicio de cuentas. Inténtalo de nuevo.";
  const detail = error.message.toLowerCase();
  if (
    error.code === "user_already_exists" ||
    detail.includes("already registered")
  )
    return "Ya existe una cuenta con ese correo. Inicia sesión.";
  if (error.code === "weak_password" || detail.includes("password should be"))
    return "La contraseña es demasiado corta. Usa al menos 12 caracteres.";
  if (detail.includes("email not confirmed"))
    return "Confirma tu correo antes de iniciar sesión.";
  if (detail.includes("invalid login credentials"))
    return "Correo o contraseña incorrectos.";
  if (error.status === 429)
    return "Demasiados intentos. Espera unos minutos y vuelve a intentarlo.";
  return "No se pudo completar la operación. Revisa tus datos e inténtalo de nuevo.";
}
