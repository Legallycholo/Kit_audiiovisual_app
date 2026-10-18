import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  CalendarClock,
  Copy,
  FileSearch,
  Globe,
  Mail,
  MessageCircle,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { uiLabel } from "../../shared/i18n";
import { Badge, Button, ErrorNote, Panel, Skeleton } from "../../shared/ui";

export interface IntegrationStatus {
  id: "ai" | "whatsapp" | "calcom" | "serpapi" | "search" | "email";
  group: "ai" | "messaging" | "scheduling" | "search" | "email";
  configured: boolean;
  testable: boolean;
  env: string[];
  provider?: string;
  models?: { proposal?: string; chat?: string; plan?: string };
  account?: string | null;
  keyHint?: string | null;
  bookingUrl?: string | null;
  usage?: { label: string; value: number; cap?: number };
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastSuccessAt: string | null;
}

const groups: { id: IntegrationStatus["group"]; title: string }[] = [
  { id: "ai", title: "IA" },
  { id: "messaging", title: "Mensajería" },
  { id: "scheduling", title: "Agenda" },
  { id: "search", title: "Búsqueda" },
  { id: "email", title: "Correo" },
];

const services: Record<
  IntegrationStatus["id"],
  { name: string; purpose: string; icon: ReactNode }
> = {
  ai: {
    name: "Proveedor de IA",
    purpose:
      "Redacta propuestas, responde en KIT y lee planos. Todo llega como sugerencia para revisar.",
    icon: <Sparkles size={20} />,
  },
  whatsapp: {
    name: "WhatsApp Cloud API",
    purpose:
      "Mensajes con clientes desde Mensajes, siempre con la confirmación del propietario.",
    icon: <MessageCircle size={20} />,
  },
  calcom: {
    name: "Cal.com",
    purpose:
      "Citas con clientes y visitas al lugar desde tu página de reservas.",
    icon: <CalendarClock size={20} />,
  },
  serpapi: {
    name: "SerpApi",
    purpose:
      "Busca en la web datos de equipos, lugares y eventos como sugerencias para tus registros.",
    icon: <Globe size={20} />,
  },
  search: {
    name: "Búsqueda semántica de archivos",
    purpose:
      "Busca por significado en los archivos autorizados del equipo. Sin ella, la búsqueda es por palabras.",
    icon: <FileSearch size={20} />,
  },
  email: {
    name: "Correo",
    purpose:
      "Recuperación de contraseña e invitaciones. Sin correo, el administrador entrega contraseñas temporales.",
    icon: <Mail size={20} />,
  },
};

const usageLabel: Record<string, string> = {
  requests: "solicitudes de IA este mes",
  sent: "mensajes enviados este mes",
  searches: "búsquedas este mes",
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("es-PR", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : null;

function statusOf(item: IntegrationStatus, testing: boolean) {
  if (testing) return { label: "Probando…", tone: "blue" };
  if (!item.configured && !item.testable)
    return { label: "Sin configurar", tone: "neutral" };
  if (item.lastTestOk === false) return { label: "Error", tone: "red" };
  if (item.lastTestOk === true) return { label: "Conectado", tone: "green" };
  return item.configured
    ? { label: "Configurado · sin probar", tone: "amber" }
    : { label: "Credenciales listas", tone: "amber" };
}

export function IntegrationCard({
  item,
  canTest,
  onTested,
}: {
  item: IntegrationStatus;
  canTest: boolean;
  onTested: () => void;
}) {
  const { request, toast } = useWorkspace();
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const service = services[item.id];
  const status = statusOf(item, testing);
  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const outcome = await request<{ ok: boolean; message: string }>(
        `/integrations/${item.id}/test`,
        { method: "POST", body: {} },
      );
      setResult(outcome);
      onTested();
    } catch (error) {
      setResult({ ok: false, message: (error as Error).message });
    } finally {
      setTesting(false);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.env.join("\n"));
      toast("Nombres de variables copiados.");
    } catch {
      toast("No se pudo copiar. Selecciona los nombres manualmente.");
    }
  };
  return (
    <article className="integration-card" aria-labelledby={`int-${item.id}`}>
      <header>
        <span className={`integration-icon ${item.id}`} aria-hidden="true">
          {service.icon}
        </span>
        <div>
          <h3 id={`int-${item.id}`}>{service.name}</h3>
          <p>{service.purpose}</p>
        </div>
        <Badge tone={status.tone}>{status.label}</Badge>
      </header>
      <dl className="integration-facts">
        {item.provider && (
          <div>
            <dt>Proveedor</dt>
            <dd>{item.provider}</dd>
          </div>
        )}
        {item.models?.proposal && (
          <div>
            <dt>Modelos</dt>
            <dd>
              Propuestas {item.models.proposal}
              {item.models.chat && ` · KIT ${item.models.chat}`}
              {item.models.plan && ` · Planos ${item.models.plan}`}
            </dd>
          </div>
        )}
        {item.account && (
          <div>
            <dt>Cuenta</dt>
            <dd>{item.account}</dd>
          </div>
        )}
        {item.keyHint && (
          <div>
            <dt>Clave</dt>
            <dd>termina en {item.keyHint.replace("…", "")}</dd>
          </div>
        )}
        {item.usage && (item.configured || item.testable) && (
          <div>
            <dt>Uso</dt>
            <dd>
              {item.usage.value}
              {item.usage.cap ? ` de ${item.usage.cap}` : ""}{" "}
              {usageLabel[item.usage.label] ?? ""}
            </dd>
          </div>
        )}
        {item.lastSuccessAt && (
          <div>
            <dt>Última prueba correcta</dt>
            <dd>{when(item.lastSuccessAt)}</dd>
          </div>
        )}
      </dl>
      {result && (
        <p
          className={result.ok ? "integration-result ok" : "integration-result"}
          role="status"
        >
          {result.message}
        </p>
      )}
      <footer>
        <details className="integration-env">
          <summary>
            {item.configured || item.testable
              ? "Variables del servidor"
              : "Cómo conectar"}
          </summary>
          <p>
            Agrega estas variables al entorno del servidor de empresa y
            reinícialo. Las claves nunca se guardan en el navegador.
          </p>
          <ul>
            {item.env.map((name) => (
              <li key={name}>
                <code>{name}</code>
              </li>
            ))}
          </ul>
          <Button variant="ghost" onClick={copy}>
            <Copy size={15} />
            Copiar nombres
          </Button>
        </details>
        {canTest && item.testable && (
          <Button variant="secondary" disabled={testing} onClick={test}>
            <PlugZap size={16} />
            {testing ? "Probando…" : "Probar conexión"}
          </Button>
        )}
      </footer>
    </article>
  );
}

/** Settings › Integraciones: real status per service, keys stay on the server. */
export function IntegrationsSettings() {
  const { mode, request } = useWorkspace();
  const [state, setState] = useState<{
    canTest: boolean;
    integrations: IntegrationStatus[];
  } | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(() => {
    request<{ canTest: boolean; integrations: IntegrationStatus[] }>(
      "/integrations",
    )
      .then((result) => {
        setState(result);
        setError("");
      })
      .catch((e) => setError((e as Error).message));
  }, [request]);
  useEffect(() => {
    if (mode === "company") load();
  }, [mode, load]);
  if (mode !== "company")
    return (
      <Panel
        title="Integraciones"
        subtitle="Las conexiones se configuran en el servidor de empresa."
      >
        <div className="panel-body">
          <p className="info-note">
            {uiLabel(
              "You are in the demo workspace. Open the company workspace to see and test the real connections.",
            )}
          </p>
          <ul className="integration-overview">
            {groups.map((group) => (
              <li key={group.id}>
                <strong>{group.title}</strong>
                <span>
                  {Object.entries(services)
                    .filter(([id]) => groupOf(id) === group.id)
                    .map(([, service]) => service.name)
                    .join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    );
  return (
    <section className="integrations" aria-labelledby="integrations-title">
      <div className="integrations-intro">
        <h2 id="integrations-title">{uiLabel("Integrations")}</h2>
        <p>
          Las claves viven solo en el servidor de empresa. Aquí ves el estado de
          cada conexión y puedes probarla sin enviar mensajes ni gastar
          búsquedas.
        </p>
        {state && !state.canTest && (
          <p className="muted">
            Solo el propietario puede probar las conexiones.
          </p>
        )}
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {!state && !error && (
        <div className="integration-group">
          <Skeleton height={140} radius="var(--radius-lg)" />
          <Skeleton height={140} radius="var(--radius-lg)" />
        </div>
      )}
      {state &&
        groups.map((group) => {
          const items = state.integrations.filter((i) => i.group === group.id);
          if (!items.length) return null;
          return (
            <div className="integration-group" key={group.id}>
              <h3 className="integration-group-title">{group.title}</h3>
              {items.map((item) => (
                <IntegrationCard
                  key={item.id}
                  item={item}
                  canTest={state.canTest}
                  onTested={load}
                />
              ))}
            </div>
          );
        })}
    </section>
  );
}

function groupOf(id: string): IntegrationStatus["group"] {
  return id === "ai"
    ? "ai"
    : id === "whatsapp"
      ? "messaging"
      : id === "calcom"
        ? "scheduling"
        : id === "email"
          ? "email"
          : "search";
}
