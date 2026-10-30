import { useEffect, useRef, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowUp,
  Paperclip,
  Plus,
  Search,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { ConnectNotice } from "./ConnectNotice";
import { LightMix } from "../shared/ui";
import { useKit } from "../shared/kit-store";
import { useWorkspace } from "../shared/store";
import type { KitMessage, KitMode, KitReference } from "../shared/kit";
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function greeting(name?: string) {
  const hour = new Date().getHours();
  const salute =
    hour < 12 ? "Buenos días" : hour < 20 ? "Buenas tardes" : "Buenas noches";
  const first = name?.trim().split(/\s+/)[0];
  return first ? `${salute}, ${first}` : salute;
}
const day = 86400000;
function historyGroup(at: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const time = new Date(at).getTime();
  const start = today.getTime();
  if (time >= start) return "Hoy";
  if (time >= start - day) return "Ayer";
  if (time >= start - 7 * day) return "Últimos 7 días";
  if (time >= start - 30 * day) return "Últimos 30 días";
  return "Anteriores";
}
export function KitChat({
  sidebar = false,
  onClose,
}: {
  sidebar?: boolean;
  onClose?: () => void;
}) {
  const kit = useKit();
  const { mode, data, user } = useWorkspace();
  const company = mode === "company";
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState("");
  const [title, setTitle] = useState("");
  const [project, setProject] = useState("");
  const [actionMode, setActionMode] = useState<KitMode>("ask");
  const [consent, setConsent] = useState(true);
  const [notice, setNotice] = useState("");
  const [confirm, setConfirm] = useState<KitMessage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const requested = params.get("thread");
  const requestedSource = params.get("source");
  const requestedSourceTitle = params.get("sourceTitle") || undefined;
  useEffect(() => {
    if (!sidebar && requested && kit.thread?.id !== requested)
      void kit.select(requested);
  }, [requested, sidebar]);
  useEffect(() => {
    if (
      !company ||
      !requestedSource ||
      kit.refs.some((r) => r.kind === "file" && r.id === requestedSource)
    )
      return;
    kit.setRefs([
      ...kit.refs,
      { kind: "file", id: requestedSource, title: requestedSourceTitle },
    ]);
  }, [company, requestedSource, requestedSourceTitle, kit.thread?.id]);
  useEffect(() => {
    setTitle(kit.thread?.title || "");
    setProject(kit.thread?.projectId || "");
    setConfirm(null);
  }, [kit.thread?.id, kit.thread?.title, kit.thread?.projectId]);
  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest" });
  }, [kit.thread?.messages.length, kit.thread?.busy]);
  const event = data.events.find(
    (e) => location.pathname === `/events/${e.id}`,
  );
  const proposal = data.proposals.find(
    (p) => location.pathname === `/proposals/${p.id}`,
  );
  const suggested: KitReference | undefined = event
    ? { kind: "event", id: event.id }
    : proposal
      ? { kind: "proposal", id: proposal.id }
      : undefined;
  const empty = !kit.thread?.messages.length;
  // Company mode without an AI key: conversations stay readable, sending waits.
  const disconnected = company && kit.statusLoaded && !kit.status.configured;
  const canSend =
    !disconnected &&
    !kit.busy &&
    !kit.thread?.busy &&
    !!kit.draft.trim() &&
    (!company || consent);
  function attach(ref: KitReference) {
    if (kit.refs.length >= 8) {
      setNotice("Máximo ocho fuentes.");
      return;
    }
    if (!kit.refs.some((r) => r.kind === ref.kind && r.id === ref.id))
      kit.setRefs([...kit.refs, ref]);
  }
  async function attachFiles(list: FileList | null) {
    if (!list) return;
    if (!company) {
      setNotice(
        "Adjuntos disponibles en el espacio de empresa. No guardes archivos privados en el modo de ejemplo.",
      );
      return;
    }
    const next = [...kit.refs];
    for (const file of Array.from(list)) {
      if (next.length >= 8) break;
      if (!/\.(txt|md|csv)$/i.test(file.name) || file.size > 64000) {
        setNotice(
          "Solo texto TXT, MD o CSV de hasta 64 KB. Los documentos e imágenes requieren el flujo de archivos.",
        );
        continue;
      }
      const text = await file.text();
      if (text.includes("\0") || text.includes("�")) {
        setNotice("Adjunto no válido como texto UTF-8.");
        continue;
      }
      next.push({
        kind: "attachment",
        id: crypto.randomUUID(),
        title: file.name,
        text,
      });
    }
    kit.setRefs(next);
  }
  const go = (id: string) => {
    void kit.select(id);
    if (!sidebar) navigate(`/kit?thread=${id}`);
  };
  const newThread = async () => {
    const t = await kit.create();
    if (t && !sidebar) navigate(`/kit?thread=${t.id}`);
  };
  const retry = (m: KitMessage) => {
    kit.setDraft(m.text);
    kit.setRefs(
      m.sources
        .map((s) => s.ref)
        .filter((r) => r.kind !== "attachment" || !!r.text),
    );
    setNotice(
      "Mensaje copiado al editor. Revísalo antes de volver a enviarlo; no se sobrescribe el historial.",
    );
  };
  const disclosure = !company && (
    <p className="kit-disclosure">
      Modo de ejemplo: mensajes guardados en este navegador sin cifrado. No hay
      respuestas simuladas ni acciones ejecutables. Usa solo datos de ejemplo;
      abre el espacio de empresa para la IA.
    </p>
  );
  const composer = (
    <>
      <form
        className="kit-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void kit.send(actionMode, consent);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void attachFiles(e.dataTransfer.files);
        }}
      >
        {(kit.refs.length > 0 ||
          (suggested &&
            company &&
            !kit.refs.some((r) => r.id === suggested.id))) && (
          <div className="kit-context-chips">
            {kit.refs.map((ref) => (
              <button
                type="button"
                className="kit-chip"
                key={`${ref.kind}:${ref.id}`}
                onClick={() => kit.setRefs(kit.refs.filter((r) => r !== ref))}
              >
                {ref.title ||
                  data.events.find((e) => e.id === ref.id)?.name ||
                  data.proposals.find((p) => p.id === ref.id)?.title ||
                  ref.id}{" "}
                ×
              </button>
            ))}
            {suggested &&
              company &&
              !kit.refs.some((r) => r.id === suggested.id) && (
                <button
                  type="button"
                  className="kit-chip suggested"
                  onClick={() => attach(suggested)}
                >
                  <Plus size={13} aria-hidden="true" />
                  Adjuntar contexto de esta página
                </button>
              )}
          </div>
        )}
        <label className="kit-editor">
          <span className="visually-hidden">Mensaje para KIT</span>
          <textarea
            ref={editor}
            maxLength={6000}
            rows={sidebar ? 2 : empty ? 3 : 2}
            value={kit.draft}
            onChange={(e) => kit.setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (canSend) e.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </label>
        <div className="kit-composer-bar">
          <div className="kit-composer-options">
            {company && (
              <>
                <button
                  type="button"
                  className="kit-tool"
                  aria-label="Adjuntar texto"
                  title="Adjuntar texto (TXT, MD o CSV)"
                  onClick={() => fileInput.current?.click()}
                >
                  <Paperclip size={16} aria-hidden="true" />
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  multiple
                  accept=".txt,.md,.csv"
                  onChange={(e) => {
                    void attachFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
                <label className="kit-pill">
                  <span className="visually-hidden">Adjuntar proyecto</span>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value)
                        attach({ kind: "event", id: e.target.value });
                    }}
                  >
                    <option value="">+ Proyecto</option>
                    {data.events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="kit-pill">
              <span className="visually-hidden">Modo</span>
              <select
                value={actionMode}
                onChange={(e) => setActionMode(e.target.value as KitMode)}
              >
                <option value="ask">Consultar (sin acciones)</option>
                <option value="act">Actuar (requiere confirmación)</option>
              </select>
            </label>
          </div>
          <div className="kit-composer-send">
            {kit.thread?.busy && (
              <button
                type="button"
                className="kit-tool"
                aria-label="Detener generación"
                title="Detener generación"
                onClick={() => void kit.stop()}
              >
                <Square size={14} aria-hidden="true" />
              </button>
            )}
            <button
              className="kit-send"
              disabled={!canSend}
              aria-label={company ? "Enviar" : "Guardar mensaje de ejemplo"}
              title={company ? "Enviar" : "Guardar mensaje de ejemplo"}
            >
              <ArrowUp size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      </form>
      {company && (
        <label className="kit-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />{" "}
          Enviar este mensaje, hasta 20 mensajes previos y el contexto
          seleccionado al proveedor. Hasta 16.000 caracteres por fuente;
          revisión de secretos parcial.
        </label>
      )}
      {kit.error && <p role="alert">{kit.error}</p>}
      {notice && <p role="status">{notice}</p>}
    </>
  );
  const messages = (
    <div
      className="kit-messages"
      aria-label="Mensajes de KIT"
      aria-live="polite"
    >
      {kit.thread?.messages.map((m, index) => (
        <article key={m.id} className={`kit-message kit-role-${m.role}`}>
          <header>
            {m.role === "assistant" && (
              <span className="kit-avatar" aria-hidden="true">
                <Sparkles size={13} />
              </span>
            )}
            <strong>{m.role === "user" ? "Tú" : "KIT"}</strong>
            <small>{m.model || new Date(m.at).toLocaleString()}</small>
          </header>
          {m.text && <p className="kit-message-text">{m.text}</p>}
          {m.status === "pending" && (
            <div className="kit-message-status">
              <LightMix showLabel />
            </div>
          )}
          {m.status !== "completed" && m.status !== "pending" && (
            <p role="status" className="kit-message-status">
              {m.error || m.status}
            </p>
          )}
          {m.sources.length > 0 && (
            <details>
              <summary>Contexto y citas ({m.sources.length})</summary>
              {m.sources.map((s) => (
                <div key={s.key}>
                  <strong>
                    {m.citations.includes(s.key) ? "Citada: " : "Contexto: "}
                    {s.label}
                  </strong>
                  <small>
                    Revisión {s.revision.slice(0, 12)}{" "}
                    {s.stale ? "· La fuente cambió desde esta respuesta" : ""}{" "}
                    {s.unavailable ? "· Acceso no disponible" : ""}
                  </small>
                  {s.route && !s.unavailable && (
                    <Link to={s.route}>Abrir fuente actual</Link>
                  )}
                  <pre>{s.text}</pre>
                </div>
              ))}
            </details>
          )}
          {m.artifacts?.map((a) => (
            <details key={a.id} className="kit-artifact">
              <summary>{a.title} · borrador</summary>
              <pre>{a.text}</pre>
              <button
                className="button"
                onClick={() => download(`kit-${a.id}.txt`, a.text)}
              >
                Exportar borrador
              </button>
              {a.route && (
                <Link to={a.route}>Abrir propuestas para revisión</Link>
              )}
            </details>
          ))}
          {m.action && (
            <div className="kit-action">
              <strong>
                {m.action.input.kind === "create_task"
                  ? "Crear tarea"
                  : "Generar borrador de propuesta"}
                : {m.action.input.title}
              </strong>
              <p>
                Proyecto:{" "}
                {data.events.find((e) => e.id === m.action!.input.eventId)
                  ?.name || m.action.input.eventId}
              </p>
              <p>
                {m.action.result ||
                  "Solo propuesta. Todavía no se ha ejecutado."}
              </p>
              {m.action.status === "pending" && (
                <button
                  className="button primary"
                  disabled={kit.busy || kit.thread?.busy}
                  onClick={() => setConfirm(m)}
                >
                  Revisar acción
                </button>
              )}
            </div>
          )}
          <div className="kit-message-tools">
            <button
              className="button ghost"
              onClick={() =>
                void navigator.clipboard.writeText(m.text).then(
                  () => setNotice("Texto copiado."),
                  () => setNotice("No se pudo copiar el texto."),
                )
              }
            >
              Copiar
            </button>
            {m.role === "user" && (
              <button
                className="button ghost"
                disabled={kit.busy || kit.thread?.busy}
                onClick={() => retry(m)}
              >
                Editar y reenviar
              </button>
            )}
            {m.role === "assistant" &&
              ["failed", "stopped", "blocked", "rate_limited"].includes(
                m.status,
              ) && (
                <button
                  className="button ghost"
                  disabled={kit.busy || kit.thread?.busy}
                  onClick={() => {
                    const previous = kit
                      .thread!.messages.slice(0, index)
                      .reverse()
                      .find((x) => x.role === "user");
                    if (previous) retry(previous);
                  }}
                >
                  Preparar reintento
                </button>
              )}
            <button
              className="button ghost"
              disabled={kit.busy || kit.thread?.busy}
              onClick={() =>
                void kit.branch(m.id).then((t) => {
                  if (t && !sidebar) navigate(`/kit?thread=${t.id}`);
                })
              }
            >
              Crear rama
            </button>
          </div>
        </article>
      ))}
      <div ref={tail} />
    </div>
  );
  const threadSettings = kit.thread && (
    <details className="kit-thread-settings">
      <summary>Conversación: {kit.thread.title}</summary>
      <div className="kit-thread-tools">
        <label>
          Título de conversación
          <input
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Proyecto de conversación
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">Sin proyecto</option>
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="button"
          disabled={kit.busy || !title.trim()}
          onClick={() => void kit.update(title.trim(), project || null)}
        >
          Guardar nombre y proyecto
        </button>
        <button
          className="button"
          onClick={() =>
            download(
              `kit-${kit.thread!.id}.json`,
              JSON.stringify(kit.thread, null, 2),
            )
          }
        >
          Exportar conversación
        </button>
        <button
          className="button"
          disabled={kit.busy}
          onClick={() => {
            if (
              window.confirm(
                "¿Eliminar esta conversación y sus artefactos? No elimina archivos o tareas del proyecto.",
              )
            ) {
              void kit.remove();
              navigate("/kit");
            }
          }}
        >
          Eliminar conversación
        </button>
      </div>
    </details>
  );
  const home = (
    <div className="kit-home">
      <span className="kit-home-mark" aria-hidden="true">
        <Sparkles size={sidebar ? 18 : 22} />
      </span>
      <p className="kit-home-greeting">{greeting(user?.name)}</p>
      <h2>¿En qué trabajamos?</h2>
      <div className="kit-suggestions">
        <button
          type="button"
          className="kit-suggestion-chip"
          onClick={() => {
            kit.setDraft("¿Qué eventos tenemos programados y qué tareas faltan por asignar?");
            editor.current?.focus();
          }}
        >
          📋 Resumen de eventos y tareas
        </button>
        <button
          type="button"
          className="kit-suggestion-chip"
          onClick={() => {
            kit.setDraft("Recomiéndame una configuración técnica de sonido e iluminación para un evento corporativo de 200 personas.");
            editor.current?.focus();
          }}
        >
          💡 Recomendar equipos técnicos
        </button>
        <button
          type="button"
          className="kit-suggestion-chip"
          onClick={() => {
            setActionMode("act");
            kit.setDraft("Propón una lista de tareas de montaje y pruebas de sonido para el próximo evento activo.");
            editor.current?.focus();
          }}
        >
          ⚡ Planificar y crear tareas
        </button>
      </div>
      {disconnected && <ConnectNotice service="kit" compact={sidebar} />}
    </div>
  );
  const confirmDialog = confirm?.action && (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar acción de KIT"
      className="kit-confirm"
    >
      <div className="panel">
        <h2>Confirmar acción de KIT</h2>
        <p>
          {confirm.action.input.kind === "create_task"
            ? "Se creará una tarea asignada a tu cuenta, en la fecha del evento, sin modificar otras tareas."
            : "Se enviará al proveedor el resumen del evento, cliente y catálogo para generar un borrador comercial. No se guardará ni enviará una propuesta."}
        </p>
        <pre>{JSON.stringify(confirm.action.input, null, 2)}</pre>
        <button
          className="button primary"
          disabled={kit.busy}
          onClick={() =>
            void kit
              .confirm(confirm.id, confirm.action!.token)
              .then(() => setConfirm(null))
          }
        >
          Confirmar esta acción
        </button>
        <button
          className="button"
          disabled={kit.busy}
          onClick={() => setConfirm(null)}
        >
          Cancelar
        </button>
      </div>
    </div>
  );
  const needle = filter.trim().toLocaleLowerCase();
  const history: Array<[string, typeof kit.threads]> = [];
  for (const t of [...kit.threads].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  )) {
    if (needle && !t.title.toLocaleLowerCase().includes(needle)) continue;
    const group = historyGroup(t.updatedAt);
    const last = history[history.length - 1];
    if (last?.[0] === group) last[1].push(t);
    else history.push([group, [t]]);
  }
  const status = kit.status.configured
    ? `${kit.status.provider} · ${kit.status.model}`
    : company
      ? "IA no conectada"
      : "Espacio de demostración · sin IA";
  if (sidebar)
    return (
      <aside className="assistant kit-chat-sidebar">
        <header className="kit-chat-header">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <h1>KIT</h1>
              <span className="kit-gemini-badge">
                <Sparkles size={11} aria-hidden="true" />
                Gemini 3.8
              </span>
            </div>
            <p>{status}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Cerrar asistente"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="kit-toolbar">
          <button
            className="button secondary"
            onClick={() => void newThread()}
            disabled={kit.busy}
          >
            <Plus size={14} aria-hidden="true" />
            Nueva conversación
          </button>
          <Link
            className="button ghost"
            to={kit.thread ? `/kit?thread=${kit.thread.id}` : "/kit"}
            onClick={onClose}
          >
            Abrir chat completo
          </Link>
        </div>
        {empty ? (
          <>
            {home}
            {messages}
          </>
        ) : (
          messages
        )}
        <div className="kit-dock">
          {composer}
          {disclosure}
        </div>
        {confirmDialog}
      </aside>
    );
  return (
    <section className={`kit-chat-page${empty ? " is-empty" : ""}`}>
      <h1 className="visually-hidden">Tu espacio con KIT</h1>
      <aside className="kit-rail">
        <button
          className="kit-new"
          onClick={() => void newThread()}
          disabled={kit.busy}
        >
          <Plus size={16} aria-hidden="true" />
          Nueva conversación
        </button>
        <label className="kit-rail-search">
          <Search size={14} aria-hidden="true" />
          <span className="visually-hidden">Buscar conversaciones</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <nav className="kit-thread-list" aria-label="Conversaciones de KIT">
          {history.map(([group, threads]) => (
            <section key={group}>
              <h2>{group}</h2>
              {threads.map((t) => (
                <button
                  key={t.id}
                  className={kit.thread?.id === t.id ? "selected" : ""}
                  aria-current={kit.thread?.id === t.id ? "true" : undefined}
                  title={t.title}
                  onClick={() => go(t.id)}
                >
                  {t.title}
                  {t.busy ? " · generando" : ""}
                </button>
              ))}
            </section>
          ))}
          {!history.length && (
            <p className="kit-rail-empty">
              {needle ? "Sin resultados." : "Aún no hay conversaciones."}
            </p>
          )}
        </nav>
        <footer className="kit-rail-footer">{status}</footer>
      </aside>
      <div className="kit-stage">
        {kit.thread && <div className="kit-stage-top">{threadSettings}</div>}
        {empty ? (
          <div className="kit-stage-home">
            {home}
            {messages}
            {composer}
            {disclosure}
          </div>
        ) : (
          <>
            {messages}
            <div className="kit-dock">
              {disconnected && <ConnectNotice service="kit" compact />}
              {composer}
              {disclosure}
            </div>
          </>
        )}
      </div>
      {confirmDialog}
    </section>
  );
}
