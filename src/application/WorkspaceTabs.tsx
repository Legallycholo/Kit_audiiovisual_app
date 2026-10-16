import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, History, Plus, X, Pin } from "lucide-react";
import { useWorkspace } from "../shared/store";
import { canSeeModule } from "../shared/access";
import { Modal } from "../shared/ui";
import {
  emptySession,
  openTab,
  readSession,
  type SessionSnapshot,
} from "./tabs";

export function WorkspaceTabs({ title }: { title: string }) {
  const { user, mode, toast } = useWorkspace();
  const key = `kit.desktop.session.v1:${mode}:${user?.id || "sample"}`;
  return (
    <TabSession
      key={key}
      storageKey={key}
      title={title}
      allowed={(route) => canSeeModule(user, route.split("?")[0])}
      report={toast}
    />
  );
}
function TabSession({
  storageKey,
  title,
  allowed,
  report,
}: {
  storageKey: string;
  title: string;
  allowed: (route: string) => boolean;
  report: (message: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [initial] = useState(() => {
    try {
      return readSession(localStorage.getItem(storageKey));
    } catch {
      return emptySession();
    }
  });
  const [state, setState] = useState(initial);
  const current = useRef(state);
  current.current = state;
  const [recovery, setRecovery] = useState(
    !initial.clean && initial.tabs.length > 0,
  );
  const [history, setHistory] = useState(false);
  const [overflow, setOverflow] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dirty, setDirty] = useState(false);
  const started = useRef(false);
  const preview = useRef(false);
  const failed = useRef(false);
  const route = location.pathname + location.search;
  useEffect(() => {
    if (recovery) return;
    if (!started.current) {
      started.current = true;
      const active = initial.tabs.find((t) => t.id === initial.active);
      if (
        route === "/" &&
        !sessionStorage.getItem(storageKey + ":started") &&
        active &&
        active.route !== "/" &&
        allowed(active.route)
      ) {
        sessionStorage.setItem(storageKey + ":started", "true");
        navigate(active.route, { replace: true });
        return;
      }
      sessionStorage.setItem(storageKey + ":started", "true");
    }
    const isPreview = preview.current;
    setState((s) => openTab(s, route, title, isPreview));
    preview.current = false;
  }, [route, title, recovery]);
  useEffect(() => {
    if (recovery) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...state, clean: false }),
      );
    } catch {
      if (!failed.current)
        report(
          "No se pudo guardar el historial local. Revisa el espacio disponible.",
        );
      failed.current = true;
    }
  }, [state, recovery, storageKey]);
  useEffect(() => {
    const clean = () => {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ ...current.current, clean: true }),
        );
      } catch {
        /* Already reported by persistence. */
      }
    };
    const dirt = (e: Event) => {
      const value = (e as CustomEvent<boolean>).detail;
      setDirty(value);
      if (value)
        setState((s) => ({
          ...s,
          tabs: s.tabs.map((t) =>
            t.id === s.active && t.preview ? { ...t, preview: false } : t,
          ),
        }));
    };
    const searchPreview = () => {
      preview.current = true;
    };
    window.addEventListener("pagehide", clean);
    window.addEventListener("kit:dirty", dirt);
    window.addEventListener("kit:preview", searchPreview);
    return () => {
      clean();
      window.removeEventListener("pagehide", clean);
      window.removeEventListener("kit:dirty", dirt);
      window.removeEventListener("kit:preview", searchPreview);
    };
  }, [storageKey]);
  function go(path: string) {
    if (!allowed(path)) return;
    window.dispatchEvent(
      new CustomEvent("kit:navigate", { detail: () => navigate(path) }),
    );
  }
  function close(ids: string[]) {
    const perform = () => {
      const s = current.current;
      const removed = s.tabs.filter((t) => ids.includes(t.id));
      const tabs = s.tabs.filter((t) => !ids.includes(t.id));
      const active =
        tabs.find((t) => t.id === s.active) || tabs[tabs.length - 1];
      const next = {
        ...s,
        tabs,
        active: active?.id || "",
        closed: [...removed, ...s.closed].slice(0, 50),
      };
      setState(tabs.length ? next : openTab(next, "/", "Inicio"));
      if (ids.includes(s.active)) navigate(active?.route || "/");
    };
    if (ids.includes(state.active))
      window.dispatchEvent(
        new CustomEvent("kit:navigate", { detail: perform }),
      );
    else perform();
  }
  function reopen() {
    const t = current.current.closed[0];
    if (!t || !allowed(t.route)) return;
    setState((s) => ({ ...s, closed: s.closed.slice(1) }));
    go(t.route);
  }
  function travel(delta: number) {
    const cursor = state.cursor + delta;
    const path = state.trail[cursor];
    if (!path || !allowed(path)) return;
    window.dispatchEvent(
      new CustomEvent("kit:navigate", {
        detail: () => {
          setState((s) => ({ ...s, cursor }));
          navigate(path);
        },
      }),
    );
  }
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]')) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "w") {
        e.preventDefault();
        close([current.current.active]);
      }
      if (k === "t") {
        e.preventDefault();
        if (e.shiftKey) reopen();
        else go("/search");
      }
      if (/^[1-9]$/.test(k)) {
        e.preventDefault();
        const t = [...current.current.tabs].sort(
          (a, b) => Number(b.pinned) - Number(a.pinned),
        )[Number(k) - 1];
        if (t) go(t.route);
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  const tabs = [...state.tabs].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned),
  );
  const visibleHistory = state.history.filter(
    (h) =>
      h.title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === "all" || h.kind === filter) &&
      (!from || h.at.slice(0, 10) >= from) &&
      (!to || h.at.slice(0, 10) <= to),
  );
  return (
    <>
      <div
        className="workspace-tabs"
        aria-label="Pestañas del espacio de trabajo"
      >
        <button
          className="icon-button"
          aria-label="Atrás"
          disabled={state.cursor <= 0}
          onClick={() => travel(-1)}
        >
          <ArrowLeft size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Adelante"
          disabled={state.cursor >= state.trail.length - 1}
          onClick={() => travel(1)}
        >
          <ArrowRight size={16} />
        </button>
        <div
          className="workspace-tab-list"
          role="tablist"
          aria-label="Pestañas abiertas"
        >
          {tabs.map((t) => (
            <div
              className={`workspace-tab ${t.id === state.active ? "selected" : ""} ${t.preview ? "preview" : ""}`}
              key={t.id}
            >
              <button
                role="tab"
                disabled={!allowed(t.route)}
                aria-selected={t.id === state.active}
                tabIndex={t.id === state.active ? 0 : -1}
                onClick={() => go(t.route)}
                title={t.title}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                    e.preventDefault();
                    const next =
                      tabs[
                        (tabs.indexOf(t) +
                          (e.key === "ArrowLeft" ? -1 : 1) +
                          tabs.length) %
                          tabs.length
                      ];
                    go(next.route);
                  }
                  if (e.key === "Delete") {
                    e.preventDefault();
                    close([t.id]);
                  }
                }}
              >
                {t.pinned && <Pin size={12} />} {t.title}
                {t.id === state.active && dirty ? " •" : ""}
                <span
                  aria-hidden="true"
                  className="tab-close"
                  onClick={(e) => {
                    e.stopPropagation();
                    close([t.id]);
                  }}
                >
                  <X size={13} />
                </span>
              </button>
            </div>
          ))}
        </div>
        <button
          className="icon-button"
          aria-label="Cerrar pestaña activa"
          onClick={() => close([state.active])}
        >
          <X size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Nueva pestaña"
          onClick={() => go("/search")}
        >
          <Plus size={16} />
        </button>
        <button
          className="button secondary"
          onClick={() => {
            setQuery("");
            setOverflow(true);
          }}
        >
          Pestañas
        </button>
        <button
          className="icon-button"
          aria-label="Historial"
          onClick={() => {
            setQuery("");
            setHistory(true);
          }}
        >
          <History size={18} />
        </button>
      </div>
      {recovery && (
        <Modal
          title="Restaurar sesión anterior"
          onClose={() => {
            setState(emptySession());
            started.current = true;
            setRecovery(false);
          }}
        >
          <div className="modal-body">
            <p>
              La sesión anterior no se cerró normalmente. Los cambios sin
              guardar pueden requerir recuperación desde el editor.
            </p>
            <button
              className="button primary"
              onClick={() => setRecovery(false)}
            >
              Restaurar pestañas
            </button>
            <button
              className="button secondary"
              onClick={() => {
                setState(emptySession());
                started.current = true;
                setRecovery(false);
              }}
            >
              Empezar de nuevo
            </button>
          </div>
        </Modal>
      )}
      {overflow && (
        <Modal title="Pestañas abiertas" onClose={() => setOverflow(false)}>
          <div className="modal-body">
            <input
              aria-label="Buscar pestañas"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="button secondary"
              disabled={!state.closed.length}
              onClick={reopen}
            >
              Reabrir pestaña cerrada
            </button>
            {tabs
              .filter((t) =>
                t.title.toLowerCase().includes(query.toLowerCase()),
              )
              .map((t) => (
                <div className="tab-management" key={t.id}>
                  <button
                    aria-label={`Copiar enlace de ${t.title}`}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          "__TAURI_INTERNALS__" in window
                            ? t.route
                            : new URL(t.route, window.location.origin).href,
                        );
                        report("Enlace copiado.");
                      } catch {
                        report("No se pudo copiar el enlace.");
                      }
                    }}
                  >
                    Copiar enlace
                  </button>
                  <button
                    disabled={!allowed(t.route)}
                    onClick={() => {
                      go(t.route);
                      setOverflow(false);
                    }}
                  >
                    {t.title}
                  </button>
                  <button
                    disabled={!allowed(t.route)}
                    onClick={() => {
                      const url = new URL(t.route, "https://kit.local");
                      url.searchParams.set("_view", crypto.randomUUID());
                      go(url.pathname + url.search);
                      setOverflow(false);
                    }}
                  >
                    Duplicar vista
                  </button>
                  <button
                    disabled={state.tabs.findIndex((x) => x.id === t.id) === 0}
                    onClick={() =>
                      setState((s) => {
                        const items = [...s.tabs];
                        const index = items.findIndex((x) => x.id === t.id);
                        if (index > 0)
                          [items[index - 1], items[index]] = [
                            items[index],
                            items[index - 1],
                          ];
                        return { ...s, tabs: items };
                      })
                    }
                  >
                    Mover a la izquierda
                  </button>
                  <button
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        tabs: s.tabs.map((x) =>
                          x.id === t.id
                            ? { ...x, pinned: !x.pinned, preview: false }
                            : x,
                        ),
                      }))
                    }
                  >
                    {t.pinned ? "Desanclar" : "Anclar"}
                  </button>
                  <button
                    onClick={() =>
                      close(
                        tabs
                          .filter((x) => x.id !== t.id && !x.pinned)
                          .map((x) => x.id),
                      )
                    }
                  >
                    Cerrar otras
                  </button>
                  <button
                    onClick={() =>
                      close(
                        tabs
                          .slice(tabs.indexOf(t) + 1)
                          .filter((x) => !x.pinned)
                          .map((x) => x.id),
                      )
                    }
                  >
                    Cerrar a la derecha
                  </button>
                </div>
              ))}
          </div>
        </Modal>
      )}
      {history && (
        <Modal title="Historial" onClose={() => setHistory(false)}>
          <div className="modal-body">
            <input
              aria-label="Buscar historial"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Tipo de historial"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {[
                ["all", "Todo"],
                ["page", "Páginas"],
                ["project", "Proyectos"],
                ["proposal", "Propuestas"],
                ["search", "Búsquedas"],
                ["design", "Diseños"],
                ["chat", "Chats"],
                ["file", "Archivos"],
                ["output", "Resultados"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <label>
              Desde
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <button
              className="button secondary"
              onClick={() =>
                setState((s) => ({
                  ...s,
                  history: s.history.filter(
                    (h) => !visibleHistory.some((v) => v.id === h.id),
                  ),
                }))
              }
            >
              Borrar resultados visibles
            </button>
            <button
              className="button secondary"
              onClick={() => setState((s) => ({ ...s, history: [] }))}
            >
              Borrar todo el historial
            </button>
            {visibleHistory.map((h) => (
              <div className="tab-management" key={h.id}>
                <button
                  disabled={!allowed(h.route)}
                  onClick={() => {
                    go(h.route);
                    setHistory(false);
                  }}
                >
                  {h.title}
                  <small>
                    {new Date(h.at).toLocaleString()} ·{" "}
                    {allowed(h.route) ? h.route : "Acceso no disponible"}
                  </small>
                </button>
                <button
                  aria-label={`Eliminar ${h.title} del historial`}
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      history: s.history.filter((x) => x.id !== h.id),
                    }))
                  }
                >
                  <X size={14} />
                </button>
              </div>
            ))}
            {!visibleHistory.length && <p>No hay actividad en este filtro.</p>}
          </div>
        </Modal>
      )}
    </>
  );
}
