import { uiLabel } from "../shared/i18n";
import { useEffect, useState } from "react";
import { LockKeyhole, LogIn, MonitorUp } from "lucide-react";
import { Button, Field, ErrorNote } from "../shared/ui";
import { api } from "../shared/api";
import { recaptchaToken } from "../shared/recaptcha";
import type { WorkspaceUser } from "../shared/access";
export function SessionAccess({
  initialized,
  error,
  retry,
  authenticated,
}: {
  initialized: boolean | null;
  error: string;
  retry: () => void;
  authenticated: (user: WorkspaceUser, csrf: string) => Promise<void>;
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
  // There is exactly one login page: the portal's. With the portal configured,
  // every visit that needs a session goes there, including a brand-new company
  // (the first portal administrator to sign in creates it). This screen remains
  // for "server unreachable" and, without a portal, for local first-time setup.
  const portalConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  );
  const goToLogin =
    !desktopLocal &&
    (initialized === true || (initialized === false && portalConfigured));
  useEffect(() => {
    if (goToLogin) window.location.replace("/portal/login");
  }, [goToLogin]);
  if (goToLogin) return null;
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
              : "Te damos la bienvenida"}
        </h1>
        <p>
          {initialized === null
            ? desktopLocal
              ? "Los registros de la empresa viven en su servidor y se abren en su propia ventana."
              : "Revisa que el servidor de empresa esté en marcha y vuelve a intentarlo."
            : setup
              ? "Crea la cuenta del propietario y un espacio vacío para la empresa."
              : "Inicia sesión para acceder a los registros y eventos de tu cuenta."}
        </p>
        {error && !desktopLocal && <ErrorNote>{error}</ErrorNote>}
        {message && <ErrorNote>{message}</ErrorNote>}
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
              const fields = new FormData(event.currentTarget);
              const email = String(fields.get("email"));
              const password = String(fields.get("password"));
              try {
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
            {setup && (
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
              hint={setup ? "Usa al menos 12 caracteres." : undefined}
            >
              <input
                required
                name="password"
                type="password"
                minLength={setup ? 12 : 1}
                maxLength={256}
                autoComplete={setup ? "new-password" : "current-password"}
              />
            </Field>
            <Button disabled={busy}>
              <LogIn size={16} />
              {busy
                ? "Conectando…"
                : setup
                  ? "Crear espacio de empresa"
                  : "Iniciar sesión"}
            </Button>
          </form>
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
