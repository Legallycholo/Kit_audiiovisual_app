import { useState } from "react";
import { useWorkspace } from "../shared/store";
import { files, nativeFiles } from "../shared/file-search";
interface CloudStatus {
  account?: { name: string; email: string };
  policy: {
    configured: boolean;
    name: string;
    region: string;
    retention: string;
    fingerprint: string;
    monthlyBudgetCents: number;
  };
  sources: Array<{ id: string; state: string; error: string }>;
  usage: Array<{ month: string; cents: number }>;
}
export function CloudSearchSettings() {
  const { mode, request } = useWorkspace();
  const [status, setStatus] = useState<CloudStatus>();
  const [token, setToken] = useState("");
  const [issued, setIssued] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const native = nativeFiles();
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  }
  const load = async () =>
    setStatus(
      native
        ? await files<CloudStatus>("cloud_search", { action: "status" })
        : await request<CloudStatus>("/search/status"),
    );
  return (
    <div className="panel">
      <h2>Nube personal, opcional</h2>
      <p>
        Conectar un dispositivo también permite buscar los registros de empresa
        autorizados en esta ventana, sin subir archivos. Los registros se abren
        en la ventana de empresa con sus controles de acceso.
      </p>
      <p>
        La búsqueda local no requiere nube. Sincronizar envía texto extraído y
        títulos al servicio de empresa y al proveedor aprobado, no los archivos
        originales. La detección de secretos es parcial: revisa tus exclusiones
        antes de autorizar.
      </p>
      {native ? (
        <>
          <label>
            Token de dispositivo emitido por tu cuenta de empresa
            <input
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </label>
          <button
            className="button"
            disabled={busy || !token}
            onClick={() =>
              void run(async () => {
                setStatus(
                  await files<CloudStatus>("cloud_search", {
                    action: "connect",
                    token,
                  }),
                );
                setToken("");
              })
            }
          >
            Conectar cuenta
          </button>
        </>
      ) : mode === "company" ? (
        <>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await request<{ token: string }>(
                  "/search/devices",
                  { method: "POST", body: { name: "KIT Desktop" } },
                );
                setIssued(result.token);
              })
            }
          >
            Crear token de dispositivo
          </button>
          {issued && (
            <div>
              <p>
                Se muestra una sola vez. Pégalo en la ventana local. Caduca en
                30 días.
              </p>
              <code>{issued}</code>
              <button className="button" onClick={() => setIssued("")}>
                Ocultar token
              </button>
            </div>
          )}
        </>
      ) : (
        <p>
          Abre la conexión de empresa para configurar una cuenta. No hay
          proveedor activo en modo de ejemplo.
        </p>
      )}
      {(native || mode === "company") && (
        <button
          className="button"
          disabled={busy}
          onClick={() => void run(load)}
        >
          Consultar proveedor y estado
        </button>
      )}
      {status && (
        <>
          {status.account && (
            <p>
              Cuenta conectada: {status.account.name} ({status.account.email}).
            </p>
          )}
          <p>
            {status.policy.configured
              ? "Proveedor habilitado"
              : "Subidas desactivadas"}
            : {status.policy.name}. Región:{" "}
            {status.policy.region || "sin aprobar"}. Retención:{" "}
            {status.policy.retention || "sin aprobar"}. Presupuesto mensual: $
            {(status.policy.monthlyBudgetCents / 100).toFixed(2)}.
          </p>
          {native && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />{" "}
                Autorizo enviar los títulos y el texto de mis archivos incluidos
                al proveedor y región indicados.
              </label>
              <div className="file-actions">
                <button
                  className="button"
                  disabled={busy || !consent || !status.policy.configured}
                  onClick={() =>
                    void run(async () => {
                      await files("cloud_search", {
                        action: "approve",
                        fingerprint: status.policy.fingerprint,
                      });
                      setMessage(
                        "Consentimiento guardado. Ahora puedes sincronizar.",
                      );
                    })
                  }
                >
                  Autorizar nube
                </button>
                <button
                  className="button"
                  disabled={busy || !status.policy.configured}
                  onClick={() =>
                    void run(async () => {
                      const result = await files<{ uploaded: number }>(
                        "cloud_search",
                        { action: "sync" },
                      );
                      setMessage(
                        `${result.uploaded} archivos sincronizados. Cada lote incluye hasta 20; repite hasta completar.`,
                      );
                      await load();
                    })
                  }
                >
                  Sincronizar / reintentar
                </button>
              </div>
            </>
          )}
          <details>
            <summary>
              Estado por fuente ({status.sources.length}, máximo 100)
            </summary>
            <ul>
              {status.sources.map((s) => (
                <li key={s.id}>
                  {s.id.slice(0, 12)}: {s.state} {s.error}
                </li>
              ))}
            </ul>
          </details>
          <p>
            Uso reservado:{" "}
            {status.usage
              .map((u) => `${u.month}: $${(u.cents / 100).toFixed(2)}`)
              .join(" · ") || "sin consumo"}
          </p>
        </>
      )}
      {(native || mode === "company") && (
        <button
          className="button"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                "¿Revocar la nube y solicitar el borrado de todas tus fuentes personales de esta empresa?",
              )
            )
              void run(async () => {
                const result = native
                  ? await files<{ confirmed: boolean; pending: number }>(
                      "cloud_search",
                      { action: "disconnect" },
                    )
                  : await request<{ confirmed: boolean; pending: number }>(
                      "/search/devices",
                      { method: "DELETE" },
                    );
                setConsent(false);
                setStatus(undefined);
                setMessage(
                  result.confirmed
                    ? "Borrado confirmado. Conexión revocada."
                    : `Borrado pendiente de confirmación (${result.pending}). Reintenta cuando el proveedor esté disponible.`,
                );
              });
          }}
        >
          Revocar nube y borrar copias
        </button>
      )}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
