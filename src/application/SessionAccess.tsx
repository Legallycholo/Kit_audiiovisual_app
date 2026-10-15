import { uiLabel } from "../shared/i18n";
import { useState } from "react";
import { ArrowLeft, LockKeyhole, LogIn } from "lucide-react";
import { Button, Field, ErrorNote } from "../shared/ui";
import { api } from "../shared/api";
import type { WorkspaceUser } from "../shared/access";
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
  const [busy, setBusy] = useState(false);
  const setup = initialized === false;
  return (
    <main className="session-screen">
      <section className="session-card">
        <div className="brand-small">kit.</div>
        <span className="eyebrow">{uiLabel("YOUR COMPANY WORKSPACE")}</span>
        <h1>
          {initialized === null
            ? "Conecta con tu empresa"
            : setup
              ? "Crea tu espacio de trabajo"
              : "Te damos la bienvenida"}
        </h1>
        <p>
          {setup
            ? "Crea la cuenta del propietario y un espacio vacío para la empresa. Los datos de ejemplo permanecen separados."
            : "Inicia sesión para acceder a los registros y eventos de tu cuenta."}
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        {message && <ErrorNote>{message}</ErrorNote>}
        {initialized === null ? (
          <Button onClick={retry}>{uiLabel("Retry connection")}</Button>
        ) : (
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setMessage("");
              const fields = new FormData(event.currentTarget);
              try {
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
        <div className="session-footnote">
          <LockKeyhole size={15} />
          <span>
            {uiLabel(
              "Company records stay on the configured server. AI and messaging connections are managed separately.",
            )}
          </span>
        </div>
        <Button variant="ghost" onClick={cancel}>
          <ArrowLeft size={15} />
          {uiLabel("Back to sample workspace")}
        </Button>
      </section>
    </main>
  );
}
