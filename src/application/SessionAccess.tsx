import { uiLabel } from "../shared/i18n";
import { useRef, useState } from "react";
import { FlaskConical, LockKeyhole, LogIn, MonitorUp } from "lucide-react";
import { Button, Field, ErrorNote, Wordmark } from "../shared/ui";
import { api } from "../shared/api";
import type { WorkspaceUser } from "../shared/access";
import {
  firebaseEnabled,
  firebaseEmailSignIn,
  firebaseGoogleSignIn,
  firebasePhoneConfirm,
  firebasePhoneStart,
  type ConfirmationResult,
} from "../shared/firebase";
export function SessionAccess({
  initialized,
  error,
  retry,
  cancel,
  authenticated,
}: {
  initialized: boolean | null;
  error: string;
  retry: () => void;
  cancel: () => void;
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
  const [phoneStep, setPhoneStep] = useState<ConfirmationResult | null>(null);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const recaptcha = useRef<HTMLDivElement>(null);
  const viaFirebase = async (getToken: () => Promise<string>) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ user: WorkspaceUser; csrf: string }>(
        "/login/firebase",
        { method: "POST", body: { idToken: await getToken() } },
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
        <Wordmark size={40} slogan />
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
              ? "Crea la cuenta del propietario y un espacio vacío para la empresa. Los datos de ejemplo permanecen separados."
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
              try {
                if (firebaseEnabled && !setup) {
                  await viaFirebase(() =>
                    firebaseEmailSignIn(
                      String(fields.get("email")),
                      String(fields.get("password")),
                    ),
                  );
                  return;
                }
                const result = await api<{
                  user: WorkspaceUser;
                  csrf: string;
                }>(setup ? "/setup" : "/login", {
                  method: "POST",
                  body: {
                    email: fields.get("email"),
                    password: fields.get("password"),
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
              <>
                <Field label={uiLabel("Your name")}>
                  <input
                    required
                    name="name"
                    autoComplete="name"
                    maxLength={200}
                  />
                </Field>
                <Field label={uiLabel("Company name")}>
                  <input
                    required
                    name="company"
                    autoComplete="organization"
                    maxLength={200}
                  />
                </Field>
              </>
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
        <div className="session-footnote">
          <LockKeyhole size={15} />
          <span>
            {uiLabel(
              "Company records stay on the configured server. AI and messaging connections are managed separately.",
            )}
          </span>
        </div>
        <div className="session-demo">
          <p>
            {uiLabel(
              "Want to look around first? The demo uses sample data saved only on this device.",
            )}
          </p>
          <Button variant="secondary" onClick={cancel}>
            <FlaskConical size={15} />
            {uiLabel("Open the demo workspace")}
          </Button>
        </div>
      </section>
    </main>
  );
}
