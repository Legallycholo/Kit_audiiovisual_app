import { uiLabel } from "../shared/i18n";
import { useRef, useState } from "react";
import {
  LockKeyhole,
  LogIn,
  MailCheck,
  MonitorUp,
  UserPlus,
} from "lucide-react";
import { Button, Field, ErrorNote } from "../shared/ui";
import { api, type ApiError } from "../shared/api";
import { recaptchaToken } from "../shared/recaptcha";
import type { WorkspaceUser } from "../shared/access";
import {
  firebaseEnabled,
  firebaseEmailSignIn,
  firebaseGoogleSignIn,
  firebasePhoneConfirm,
  firebasePhoneStart,
  type ConfirmationResult,
} from "../shared/firebase";
import {
  supabaseEnabled,
  supabaseMessage,
  supabaseResendConfirmation,
  supabaseSignIn,
  supabaseSignUp,
  SupabaseSignInError,
} from "../shared/supabase";
export function SessionAccess({
  initialized,
  error,
  retry,
  authenticated,
  enterWithoutBackend,
}: {
  initialized: boolean | null;
  error: string;
  retry: () => void;
  authenticated: (user: WorkspaceUser, csrf: string) => Promise<void>;
  /** Temporary dev-only bypass while there is no backend. */
  enterWithoutBackend?: () => void;
}) {
  const [message, setMessage] = useState("");
  // The local desktop window reaches the company server in its own window.
  const desktopLocal =
    "__TAURI_INTERNALS__" in window && window.location.port !== "3001";
  const openCompanyWindow = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("open_company_window");
    } catch {
      setMessage(
        "Inicia el servidor de empresa con npm start en el puerto 3001 y vuelve a intentarlo.",
      );
    }
  };
  const [busy, setBusy] = useState(false);
  const setup = initialized === false;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [notice, setNotice] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState("");
  const signup = supabaseEnabled && !setup && mode === "signup";
  const switchMode = (next: "signin" | "signup") => {
    setMode(next);
    setMessage("");
    setNotice("");
    setAwaitingConfirmation("");
  };
  /**
   * Exchanges a Supabase access token for a KIT session. The server verifies
   * the token and reads the approved role from the database, so a pending
   * account is refused here no matter what the browser holds.
   */
  const exchangeSupabase = async (accessToken: string) => {
    try {
      const result = await api<{ user: WorkspaceUser; csrf: string }>(
        "/login/supabase",
        {
          method: "POST",
          body: {
            accessToken,
            recaptchaToken: await recaptchaToken("LOGIN"),
          },
        },
      );
      await authenticated(result.user, result.csrf);
      return true;
    } catch (err) {
      // "Waiting for approval" is the expected answer for a new account, so it
      // is reported as a status rather than as a failure.
      const failure = err as ApiError;
      if (failure.status === 403) setNotice(failure.message);
      else setMessage(failure.message);
      return false;
    }
  };
  const viaSupabase = async (email: string, password: string) => {
    let accessToken: string;
    try {
      accessToken = await supabaseSignIn(email, password);
    } catch (err) {
      // The owner created by POST /api/setup has a server password and no
      // Supabase account, so that path stays available.
      if (err instanceof SupabaseSignInError && err.status === 400) {
        try {
          const result = await api<{ user: WorkspaceUser; csrf: string }>(
            "/login",
            {
              method: "POST",
              body: {
                email,
                password,
                recaptchaToken: await recaptchaToken("LOGIN"),
              },
            },
          );
          await authenticated(result.user, result.csrf);
          return;
        } catch {
          setMessage(supabaseMessage(err));
          return;
        }
      }
      setMessage(supabaseMessage(err));
      return;
    }
    await exchangeSupabase(accessToken);
  };
  const register = async (email: string, password: string, name: string) => {
    let outcome;
    try {
      outcome = await supabaseSignUp(email, password, name);
    } catch (err) {
      setMessage(supabaseMessage(err));
      return;
    }
    if (outcome.kind === "confirm-email") {
      setAwaitingConfirmation(outcome.email);
      setNotice(
        `Revisa ${outcome.email} y confirma tu correo. Después, un administrador debe aprobar tu cuenta.`,
      );
      return;
    }
    // Confirmation is switched off, so the account exists already; the server
    // still refuses it until an administrator approves it.
    if (!(await exchangeSupabase(outcome.accessToken))) setMode("signin");
  };
  const [phoneStep, setPhoneStep] = useState<ConfirmationResult | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const recaptcha = useRef<HTMLDivElement>(null);
  const viaFirebase = async (getToken: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ user: WorkspaceUser; csrf: string }>(
        "/login/firebase",
        {
          method: "POST",
          body: {
            idToken: await getToken(),
            recaptchaToken: await recaptchaToken("LOGIN"),
          },
        },
      );
      await authenticated(result.user, result.csrf);
    } catch (err) {
      setMessage(
        (err as { code?: string }).code?.startsWith("auth/")
          ? "No se pudo iniciar sesión. Revisa tus datos e inténtalo de nuevo."
          : (err as Error).message,
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="session-screen">
      <section className="session-card">
        <img
          className="brand-logo login"
          src="/kit-logo.png"
          alt="KIT audiovisual"
        />
        <span className="eyebrow">{uiLabel("YOUR COMPANY WORKSPACE")}</span>
        <h1>
          {initialized === null
            ? desktopLocal
              ? "Abre el espacio de tu empresa"
              : "No se pudo conectar con el servidor"
            : setup
              ? "Crea tu espacio de trabajo"
              : signup
                ? "Crea tu cuenta"
                : "Te damos la bienvenida"}
        </h1>
        <p>
          {initialized === null
            ? desktopLocal
              ? "Los registros de la empresa viven en su servidor y se abren en su propia ventana."
              : "Revisa que el servidor de empresa esté en marcha y vuelve a intentarlo."
            : setup
              ? "Crea la cuenta del propietario y un espacio vacío para la empresa."
              : signup
                ? "Regístrate y un administrador te asignará un rol para entrar."
                : "Inicia sesión para acceder a los registros y eventos de tu cuenta."}
        </p>
        {error && !desktopLocal && <ErrorNote>{error}</ErrorNote>}
        {message && <ErrorNote>{message}</ErrorNote>}
        {notice && (
          <p className="session-notice">
            <MailCheck size={15} />
            <span>{notice}</span>
          </p>
        )}
        {supabaseEnabled && !setup && initialized !== null && (
          <div className="session-switch">
            <button
              type="button"
              aria-pressed={mode === "signin"}
              className={mode === "signin" ? "is-current" : ""}
              onClick={() => switchMode("signin")}
            >
              {uiLabel("Sign in")}
            </button>
            <button
              type="button"
              aria-pressed={mode === "signup"}
              className={mode === "signup" ? "is-current" : ""}
              onClick={() => switchMode("signup")}
            >
              {uiLabel("Create account")}
            </button>
          </div>
        )}
        {initialized === null ? (
          <div className="session-actions">
            {desktopLocal ? (
              <Button onClick={() => void openCompanyWindow()}>
                <MonitorUp size={16} />
                {uiLabel("Open the company workspace")}
              </Button>
            ) : (
              <Button onClick={retry}>{uiLabel("Retry connection")}</Button>
            )}
          </div>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setMessage("");
              setNotice("");
              const fields = new FormData(event.currentTarget);
              const email = String(fields.get("email"));
              const password = String(fields.get("password"));
              try {
                if (signup) {
                  await register(email, password, String(fields.get("name")));
                  return;
                }
                if (supabaseEnabled && !setup) {
                  await viaSupabase(email, password);
                  return;
                }
                if (firebaseEnabled && !setup) {
                  await viaFirebase(() => firebaseEmailSignIn(email, password));
                  return;
                }
                const result = await api<{
                  user: WorkspaceUser;
                  csrf: string;
                }>(setup ? "/setup" : "/login", {
                  method: "POST",
                  body: {
                    email,
                    password,
                    ...(setup
                      ? {}
                      : { recaptchaToken: await recaptchaToken("LOGIN") }),
                    ...(setup
                      ? {
                          name: fields.get("name"),
                          company: fields.get("company"),
                        }
                      : {}),
                  },
                });
                await authenticated(result.user, result.csrf);
              } catch (err) {
                setMessage((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {(setup || signup) && (
              <Field label={uiLabel("Your name")}>
                <input
                  required
                  name="name"
                  autoComplete="name"
                  maxLength={200}
                />
              </Field>
            )}
            {setup && (
              <Field label={uiLabel("Company name")}>
                <input
                  required
                  name="company"
                  autoComplete="organization"
                  maxLength={200}
                />
              </Field>
            )}
            <Field label={uiLabel("Email")}>
              <input
                required
                type="email"
                name="email"
                autoComplete="username"
              />
            </Field>
            <Field
              label={uiLabel("Password")}
              hint={setup || signup ? "Usa al menos 12 caracteres." : undefined}
            >
              <input
                required
                name="password"
                type="password"
                minLength={setup || signup ? 12 : 1}
                maxLength={256}
                autoComplete={
                  setup || signup ? "new-password" : "current-password"
                }
              />
            </Field>
            <Button disabled={busy}>
              {signup ? <UserPlus size={16} /> : <LogIn size={16} />}
              {busy
                ? "Conectando…"
                : setup
                  ? "Crear espacio de empresa"
                  : signup
                    ? "Crear cuenta"
                    : "Iniciar sesión"}
            </Button>
            {signup && (
              <p className="session-hint">
                {uiLabel(
                  "A new account has no access until an administrator approves it and assigns a role.",
                )}
              </p>
            )}
          </form>
        )}
        {awaitingConfirmation && (
          <div className="session-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await supabaseResendConfirmation(awaitingConfirmation);
                  setNotice(
                    `Te enviamos otro correo de confirmación a ${awaitingConfirmation}.`,
                  );
                } catch (err) {
                  setMessage(supabaseMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {uiLabel("Resend the confirmation email")}
            </Button>
          </div>
        )}
        {firebaseEnabled && !setup && initialized !== null && (
          <div className="session-actions">
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void viaFirebase(firebaseGoogleSignIn)}
            >
              Continuar con Google
            </Button>
            {!phoneOpen ? (
              <Button variant="secondary" onClick={() => setPhoneOpen(true)}>
                Continuar con teléfono
              </Button>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const fields = new FormData(event.currentTarget);
                  if (!phoneStep)
                    void (async () => {
                      setBusy(true);
                      setMessage("");
                      try {
                        setPhoneStep(
                          await firebasePhoneStart(
                            String(fields.get("phone")),
                            recaptcha.current!,
                          ),
                        );
                      } catch {
                        setMessage(
                          "No se pudo enviar el código. Usa el formato +52…",
                        );
                      } finally {
                        setBusy(false);
                      }
                    })();
                  else
                    void viaFirebase(() =>
                      firebasePhoneConfirm(
                        phoneStep,
                        String(fields.get("code")),
                      ),
                    );
                }}
              >
                {!phoneStep ? (
                  <Field label="Teléfono (con código de país)">
                    <input
                      required
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                    />
                  </Field>
                ) : (
                  <Field label="Código recibido por SMS">
                    <input
                      required
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                    />
                  </Field>
                )}
                <Button disabled={busy}>
                  {phoneStep ? "Verificar código" : "Enviar código"}
                </Button>
                <div ref={recaptcha} />
              </form>
            )}
          </div>
        )}
        {enterWithoutBackend && (
          <div className="session-actions">
            <Button variant="secondary" onClick={enterWithoutBackend}>
              Entrar sin servidor (temporal)
            </Button>
          </div>
        )}
        <div className="session-footnote">
          <LockKeyhole size={15} />
          <span>
            {uiLabel(
              "Company records stay on the configured server. AI and messaging connections are managed separately.",
            )}
          </span>
        </div>
      </section>
    </main>
  );
}
