import { uiLabel } from "../shared/i18n";
import { canEditCollection, canSeeModule } from "../shared/access";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  CalendarPlus,
  CheckCheck,
  CloudOff,
  FilePlus2,
  FileText,
  Menu as MenuIcon,
  MessageCircle,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
  TriangleAlert,
  Upload,
  UserPlus,
  WandSparkles,
} from "lucide-react";
import { useWorkspace } from "../shared/store";
import { useKit } from "../shared/kit-store";
import {
  Badge,
  Button,
  CommandPalette,
  Kbd,
  Modal,
  Popover,
  Skeleton,
  Toast,
  type PaletteGroup,
  type PaletteItem,
} from "../shared/ui";
import { Dashboard } from "../modules/Dashboard";
import { Events, EventDetail } from "../modules/Events";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { DraftNavigation } from "./DraftNavigation";
import { KitChat } from "../modules/KitChat";
import type { searchWorkspace as SearchWorkspace } from "../shared/search";

// Route modules load on first visit so the first paint of Inicio stays small;
// Diseño (Three.js) and the other heavy workspaces never load until opened.
const page = <T extends Record<string, unknown>, K extends keyof T>(
  load: () => Promise<T>,
  name: K,
) =>
  lazy(() =>
    load().then((module) => ({
      default: module[name] as ComponentType<object>,
    })),
  );
const Clients = page(() => import("../modules/Directory"), "Clients");
const Venues = page(() => import("../modules/Directory"), "Venues");
const Proposals = page(() => import("../modules/Proposals"), "Proposals");
const ProposalEditor = page(
  () => import("../modules/Proposals"),
  "ProposalEditor",
);
const Inbox = page(() => import("../modules/Inbox"), "Inbox");
const Inventory = page(() => import("../modules/Inventory"), "Inventory");
const Production = page(() => import("../modules/Operations"), "Production");
const Reports = page(() => import("../modules/Operations"), "Reports");
const SettingsPage = page(
  () => import("../modules/Operations"),
  "SettingsPage",
);
const Creative = page(() => import("../modules/Operations"), "Creative");
const Design = page(() => import("../modules/Design"), "Design");
const SearchPage = page(
  () => import("../modules/UniversalSearch"),
  "SearchPage",
);
const FileLibrary = page(() => import("../modules/FileLibrary"), "FileLibrary");
const FilePreview = page(() => import("../modules/FileLibrary"), "FilePreview");

function PageLoading() {
  return (
    <div className="page-loading" aria-busy="true">
      <Skeleton width={220} height={28} radius="var(--radius-sm)" />
      <Skeleton height={120} radius="var(--radius-lg)" />
      <Skeleton height={220} radius="var(--radius-lg)" />
    </div>
  );
}
import { AppearanceContext, useAppearanceState } from "../shared/appearance";
import { Sidebar } from "./Sidebar";
import {
  activeDestination,
  destinations,
  pageLabel,
  paletteDestinations,
} from "./navigation";

/** Desktop tabs are a Tauri feature; the browser already has its own tabs. */
function isDesktopShell() {
  if ("__TAURI_INTERNALS__" in window) return true;
  try {
    // Development builds can opt in so the tab system stays testable.
    return (
      import.meta.env.DEV && localStorage.getItem("kit.desktop-tabs") === "on"
    );
  } catch {
    return false;
  }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const change = () => setMatches(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [query]);
  return matches;
}

const normalize = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase();

type Recent = { id: string; label: string; to: string };

export function App() {
  const {
    data,
    notice,
    toast,
    storageError,
    user,
    mode,
    saving,
    refresh,
    sync,
    retrySync,
    resolveSync,
  } = useWorkspace();
  const kit = useKit();
  const location = useLocation();
  const navigate = useNavigate();
  const appearanceState = useAppearanceState(mode, user?.id);
  const { appearance, setAppearance } = appearanceState;
  const mobile = useMediaQuery("(max-width: 899px)");
  const [assistant, setAssistant] = useState(false);
  const shellKey = `kit.shell:${mode}:${user?.id || "sample"}`;
  useEffect(() => {
    try {
      setAssistant(localStorage.getItem(shellKey + ":assistant") === "true");
    } catch {
      /* Continue without saved preferences. */
    }
  }, [shellKey]);
  const toggleAssistant = useCallback(
    (open: boolean) => {
      setAssistant(open);
      try {
        localStorage.setItem(shellKey + ":assistant", String(open));
      } catch {
        toast("No se pudo guardar la preferencia del asistente.");
      }
    },
    [shellKey, toast],
  );
  const [mobileNav, setMobileNav] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const [palette, setPalette] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(false);
  const bell = useRef<HTMLButtonElement>(null);
  const [help, setHelp] = useState(false);
  const collapsed = appearance.sidebar === "collapsed";
  const toggleCollapsed = useCallback(
    () =>
      setAppearance({
        sidebar: appearance.sidebar === "collapsed" ? "expanded" : "collapsed",
      }),
    [appearance.sidebar, setAppearance],
  );
  const destination = activeDestination(location.pathname);
  const currentLabel = pageLabel(location.pathname);
  const recordTitle =
    data.events.find((e) => location.pathname === `/events/${e.id}`)?.name ||
    data.proposals.find((p) => location.pathname === `/proposals/${p.id}`)
      ?.title;
  const pending = data.conversations.filter((c) =>
    ["Pending", "Needs linking"].includes(c.review),
  ).length;
  // "Review reminders" in Settings › General controls the visual indicators.
  const remind = data.settings.notifications;
  useEffect(() => {
    setMobileNav(false);
    document.title = `${recordTitle || currentLabel} · KIT`;
  }, [location.pathname, currentLabel, recordTitle]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => toast(""), 5500);
    return () => clearTimeout(timeout);
  }, [notice, toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((value) => (value === null ? "" : null));
      } else if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleCollapsed]);
  const closeMobileNav = useCallback(() => {
    setMobileNav(false);
    menuButton.current?.focus();
  }, []);

  // ---------- Command palette ----------
  // The record index loads the first time the palette opens.
  const [searchIndex, setSearchIndex] = useState<typeof SearchWorkspace | null>(
    null,
  );
  useEffect(() => {
    if (palette === null || searchIndex) return;
    void import("../shared/search").then((module) =>
      setSearchIndex(() => module.searchWorkspace),
    );
  }, [palette, searchIndex]);
  const recentKey = `kit.palette:${mode}:${user?.id || "sample"}`;
  const [recent, setRecent] = useState<Recent[]>([]);
  useEffect(() => {
    try {
      setRecent(JSON.parse(localStorage.getItem(recentKey) || "[]"));
    } catch {
      setRecent([]);
    }
  }, [recentKey]);
  const go = useCallback(
    (entry: Recent, preview = false) => {
      setRecent((items) => {
        const next = [entry, ...items.filter((i) => i.id !== entry.id)].slice(
          0,
          5,
        );
        try {
          localStorage.setItem(recentKey, JSON.stringify(next));
        } catch {
          /* Recent commands are a convenience only. */
        }
        return next;
      });
      if (preview) window.dispatchEvent(new Event("kit:preview"));
      window.dispatchEvent(
        new CustomEvent("kit:navigate", { detail: () => navigate(entry.to) }),
      );
    },
    [navigate, recentKey],
  );
  const groups = useMemo<PaletteGroup[]>(() => {
    if (palette === null) return [];
    const query = palette.trim();
    const q = normalize(query);
    const matches = (text: string) => !q || normalize(text).includes(q);
    const admin = user?.role === "Administrator";
    const actions: (PaletteItem & { allowed: boolean; to: string })[] = [
      {
        id: "action:new-event",
        label: uiLabel("Nuevo evento"),
        icon: <CalendarPlus size={17} />,
        to: "/events?new=1",
        allowed: canEditCollection(user, "events"),
        run: () => {},
      },
      {
        id: "action:new-proposal",
        label: uiLabel("Nueva propuesta"),
        icon: <FilePlus2 size={17} />,
        to: "/proposals?new=manual",
        allowed: canEditCollection(user, "proposals"),
        run: () => {},
      },
      {
        id: "action:ai-proposal",
        label: uiLabel("Redactar propuesta con IA"),
        icon: <WandSparkles size={17} />,
        to: "/proposals?new=ai",
        allowed: canEditCollection(user, "proposals"),
        run: () => {},
      },
      {
        id: "action:new-client",
        label: uiLabel("Nuevo cliente"),
        icon: <UserPlus size={17} />,
        to: "/clients?new=1",
        allowed: canEditCollection(user, "clients"),
        run: () => {},
      },
      {
        id: "action:upload-plan",
        label: uiLabel("Subir plano"),
        icon: <Upload size={17} />,
        to: "/design?upload=1",
        allowed: canEditCollection(user, "layouts"),
        run: () => {},
      },
      {
        id: "action:integrations",
        label: uiLabel("Ir a Integraciones"),
        icon: <Plug size={17} />,
        to: "/settings/integrations",
        allowed: admin,
        run: () => {},
      },
    ];
    const actionItems = actions
      .filter((a) => a.allowed && canSeeModule(user, a.to) && matches(a.label))
      .map(({ allowed: _allowed, ...a }) => ({
        ...a,
        run: () => go({ id: a.id, label: a.label, to: a.to }),
      }));
    const pages = paletteDestinations(user, mode)
      .filter((p) => matches(`${p.label} ${p.group}`))
      .map((p) => {
        const icon = destinations.find((d) => d.label === p.group)?.icon;
        const Icon = icon;
        return {
          id: `page:${p.id}`,
          label: uiLabel(p.label),
          hint: p.group !== p.label ? uiLabel(p.group) : undefined,
          icon: Icon ? <Icon size={17} /> : undefined,
          run: () => go({ id: `page:${p.id}`, label: p.label, to: p.to }),
        };
      });
    const records =
      query && searchIndex
        ? searchIndex(data, user, query)
            .slice(0, 8)
            .map((r) => ({
              id: `record:${r.path}`,
              label: r.title,
              hint: r.type,
              icon: <FileText size={17} />,
              run: () =>
                go(
                  { id: `record:${r.path}`, label: r.title, to: r.path },
                  true,
                ),
            }))
        : [];
    const ask =
      query && canSeeModule(user, "/kit")
        ? [
            {
              id: "ask-kit",
              label: `${uiLabel("Preguntar a KIT")}: «${query}»`,
              icon: <Sparkles size={17} />,
              run: () => {
                kit.setDraft(query);
                toggleAssistant(true);
              },
            },
          ]
        : [];
    const recentItems = query
      ? []
      : recent
          .filter((r) => canSeeModule(user, r.to))
          .map((r) => ({
            id: `recent:${r.id}`,
            label: uiLabel(r.label),
            icon: <RefreshCw size={16} />,
            run: () => go(r),
          }));
    return [
      { id: "recent", title: "Recientes", items: recentItems },
      { id: "actions", title: "Acciones", items: actionItems },
      { id: "pages", title: "Ir a", items: pages },
      { id: "records", title: "Registros", items: records },
      { id: "ask", title: "Preguntar a KIT", items: ask },
    ];
  }, [
    palette,
    data,
    user,
    mode,
    recent,
    go,
    kit,
    toggleAssistant,
    searchIndex,
  ]);

  const showTabs = isDesktopShell();
  return (
    <AppearanceContext.Provider value={appearanceState}>
      <div
        className={`app ${assistant ? "assistant-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}
      >
        <DraftNavigation />
        <a href="#main" className="skip-link">
          {uiLabel("Skip to workspace")}
        </a>
        {mobile && mobileNav && (
          <button
            className="nav-backdrop"
            aria-label={uiLabel("Close navigation")}
            onClick={closeMobileNav}
          />
        )}
        <Sidebar
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          mobile={mobile}
          mobileOpen={mobileNav}
          onCloseMobile={closeMobileNav}
          onOpenPalette={() => setPalette("")}
          onOpenHelp={() => setHelp(true)}
          pendingCount={remind ? pending : 0}
        />
        <div className="app-body">
          <header className="topbar">
            <div className="breadcrumbs">
              <button
                ref={menuButton}
                className="icon-button menu-toggle"
                aria-label={uiLabel("Open navigation")}
                aria-expanded={mobileNav}
                onClick={() => setMobileNav(true)}
              >
                <MenuIcon size={20} aria-hidden="true" />
              </button>
              <nav aria-label={uiLabel("Breadcrumb")} className="crumbs">
                {destination && destination.label !== currentLabel && (
                  <>
                    <Link className="crumb desktop-only" to={destination.to}>
                      {uiLabel(destination.label)}
                    </Link>
                    <span
                      className="crumb-divider desktop-only"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  </>
                )}
                {recordTitle ? (
                  <>
                    <Link
                      className="crumb desktop-only"
                      to={
                        location.pathname.startsWith("/events")
                          ? "/events"
                          : "/proposals"
                      }
                    >
                      {uiLabel(currentLabel)}
                    </Link>
                    <span
                      className="crumb-divider desktop-only"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <strong aria-current="page">{recordTitle}</strong>
                  </>
                ) : (
                  <strong aria-current="page">{uiLabel(currentLabel)}</strong>
                )}
              </nav>
            </div>
            <div className="topbar-actions">
              <button
                className="global-search"
                onClick={() => setPalette("")}
                aria-label={uiLabel("Search anything…")}
              >
                <Search size={16} aria-hidden="true" />
                <span className="desktop-only">
                  {uiLabel("Search anything…")}
                </span>
                <span className="desktop-only">
                  <Kbd keys={["mod", "K"]} />
                </span>
              </button>
              <button
                ref={bell}
                className="icon-button notification-button"
                aria-label={`Notificaciones: ${pending} pendientes de revisión`}
                aria-expanded={notifications}
                aria-haspopup="dialog"
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} aria-hidden="true" />
                {remind && pending > 0 && <i aria-hidden="true" />}
              </button>
              {canSeeModule(user, "/kit") && (
                <button
                  className={`assistant-toggle ${assistant ? "selected" : ""}`}
                  aria-pressed={assistant}
                  onClick={() => toggleAssistant(!assistant)}
                >
                  <Sparkles size={16} aria-hidden="true" />
                  <span>{uiLabel("Ask KIT")}</span>
                </button>
              )}
            </div>
          </header>
          {showTabs && (
            <WorkspaceTabs
              title={
                recordTitle ||
                (location.pathname === "/search"
                  ? `Búsqueda: ${new URLSearchParams(location.search).get("q") || "Nueva"}`
                  : uiLabel(currentLabel))
              }
            />
          )}
          {mode === "company" && sync.pending && (
            <section
              id="sync-review"
              className={`sync-review ${sync.state === "conflict" ? "conflict" : "queued"}`}
              aria-label="Estado de sincronización"
              aria-live="polite"
            >
              {sync.state === "conflict" ? (
                <TriangleAlert size={18} aria-hidden="true" />
              ) : sync.state === "syncing" ? (
                <RefreshCw size={18} aria-hidden="true" />
              ) : (
                <CloudOff size={18} aria-hidden="true" />
              )}
              <div>
                <strong>
                  {sync.state === "conflict"
                    ? "Revisa el guardado pendiente"
                    : "Cambio protegido en este dispositivo"}
                </strong>
                <p>
                  {sync.state === "conflict"
                    ? "Otra sesión cambió el espacio. Elige conservar el servidor o aplicar conscientemente tus valores locales sobre la revisión más reciente."
                    : "El contenido está cifrado con esta sesión y no se enviará hasta que reintentes la conexión."}
                </p>
                <small>
                  Registros:{" "}
                  {sync.targets
                    .map((target) => `${target.collection}/${target.id}`)
                    .join(", ")}
                </small>
              </div>
              <div className="sync-review-actions">
                {sync.state === "conflict" && (
                  <>
                    <Button
                      variant="secondary"
                      disabled={saving}
                      onClick={() => void resolveSync("server")}
                    >
                      Usar versión del servidor
                    </Button>
                    <Button
                      disabled={saving}
                      onClick={() => void resolveSync("local")}
                    >
                      Aplicar mis cambios revisados
                    </Button>
                  </>
                )}
                {sync.state !== "conflict" && (
                  <Button disabled={saving} onClick={() => void retrySync()}>
                    Reintentar ahora
                  </Button>
                )}
              </div>
            </section>
          )}
          {storageError && (
            <div className="error-note shell-note" role="alert">
              {uiLabel(storageError)}
              {mode === "company" && (
                <button onClick={refresh}>Actualizar datos</button>
              )}
            </div>
          )}
          <main id="main" className="main-workspace">
            {canSeeModule(user, location.pathname) ? (
              <Suspense fallback={<PageLoading />}>
                <Routes>
                  <Route
                    path="/library"
                    element={<Navigate to="/inventory" replace />}
                  />
                  <Route path="/library/files" element={<FileLibrary />} />
                  <Route path="/files/:id" element={<FilePreview />} />
                  <Route path="/kit" element={<KitChat />} />
                  <Route
                    path="/search"
                    element={
                      <SearchPage
                        key={`${mode}:${user?.id || "local"}:${new URLSearchParams(location.search).get("q") || ""}`}
                      />
                    }
                  />
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/events" element={<Events />} />
                  <Route path="/events/:eventId" element={<EventDetail />} />
                  <Route path="/clients" element={<Clients />} />
                  <Route path="/venues" element={<Venues />} />
                  <Route path="/design" element={<Design />} />
                  <Route path="/creative" element={<Creative />} />
                  <Route path="/proposals" element={<Proposals />} />
                  <Route
                    path="/proposals/:proposalId"
                    element={<ProposalEditor />}
                  />
                  <Route path="/inbox" element={<Inbox />} />
                  <Route path="/inventory" element={<Inventory />} />
                  <Route path="/production" element={<Production />} />
                  <Route path="/reports" element={<Reports />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/settings/:section" element={<SettingsPage />} />
                  <Route
                    path="*"
                    element={
                      <div className="empty">
                        <h1>{uiLabel("This page isn't in the workspace.")}</h1>
                        <Link className="button primary" to="/">
                          {uiLabel("Back to dashboard")}
                        </Link>
                      </div>
                    }
                  />
                </Routes>
              </Suspense>
            ) : (
              <div className="empty">
                <h1>Acceso restringido</h1>
                <p>Tu cuenta no tiene acceso a esta sección.</p>
                <Link to="/">Volver al inicio</Link>
              </div>
            )}
          </main>
        </div>
        {assistant && (
          <KitChat sidebar onClose={() => toggleAssistant(false)} />
        )}
        {notice && <Toast message={notice} onDismiss={() => toast("")} />}
        <Popover
          anchor={bell}
          open={notifications}
          onClose={() => setNotifications(false)}
          placement="bottom-end"
          className="notification-popover"
          role="dialog"
          label={uiLabel("Needs your attention")}
        >
          <div className="notification-heading">
            <h2>{uiLabel("Needs your attention")}</h2>
          </div>
          {data.conversations
            .filter((c) => ["Pending", "Needs linking"].includes(c.review))
            .map((c) => (
              <button
                className="notification-item"
                key={c.id}
                onClick={() => {
                  navigate(`/inbox?conversation=${c.id}`);
                  setNotifications(false);
                }}
              >
                <span className="notification-symbol">
                  <MessageCircle size={19} aria-hidden="true" />
                </span>
                <span>
                  <strong>
                    {c.review === "Needs linking"
                      ? "Vincular respuesta con una oferta"
                      : uiLabel("Review client acceptance")}
                  </strong>
                  <small>
                    {
                      data.clients.find((client) => client.id === c.clientId)
                        ?.name
                    }{" "}
                    {c.proposalVersion
                      ? ` · versión ${c.proposalVersion}`
                      : " · oferta sin identificar"}
                  </small>
                  <Badge>
                    {c.review === "Needs linking"
                      ? "Requiere vinculación"
                      : uiLabel("Awaiting owner review")}
                  </Badge>
                </span>
                <ArrowUpRight size={16} aria-hidden="true" />
              </button>
            ))}
          {pending === 0 && (
            <div className="empty compact">
              <CheckCheck size={25} aria-hidden="true" />
              <h3>{uiLabel("You're all caught up.")}</h3>
              <p>{uiLabel("No acceptance requests awaiting review.")}</p>
            </div>
          )}
        </Popover>
        <CommandPalette
          open={palette !== null}
          onClose={() => setPalette(null)}
          query={palette ?? ""}
          onQuery={setPalette}
          groups={groups}
          onFullSearch={(query) =>
            window.dispatchEvent(
              new CustomEvent("kit:navigate", {
                detail: () =>
                  navigate(`/search?q=${encodeURIComponent(query)}`),
              }),
            )
          }
        />
        {help && <HelpGuide onClose={() => setHelp(false)} />}
      </div>
    </AppearanceContext.Provider>
  );
}

function HelpGuide({ onClose }: { onClose: () => void }) {
  const places: [string, string][] = [
    ["Inicio", "Resumen del día e informes."],
    ["Eventos", "Cada evento con su calendario, lugar, equipos y producción."],
    ["Ventas", "Propuestas, mensajes de clientes y clientes."],
    ["Diseño", "Planos 2D, vista 3D y estudio creativo."],
    ["Recursos", "Equipos, lugares y archivos."],
    [
      "KIT",
      "Pregunta sobre tus eventos y propuestas. KIT sugiere; tú confirmas.",
    ],
  ];
  const shortcuts: [string[], string][] = [
    [["mod", "K"], "Buscar y ejecutar acciones"],
    [["mod", "\\"], "Contraer o expandir la barra lateral"],
    [["mod", "enter"], "En la búsqueda: abrir la búsqueda completa"],
    [["Esc"], "Cerrar diálogos y menús"],
  ];
  return (
    <Modal title="Guía rápida de KIT" onClose={onClose}>
      <div className="modal-body help-guide">
        <h3>Cómo empezar</h3>
        <ol>
          <li>Crea el cliente y el evento.</li>
          <li>Agrega el lugar, el plano y los equipos.</li>
          <li>Prepara la propuesta y revísala antes de enviarla.</li>
          <li>Coordina al equipo en Producción.</li>
        </ol>
        <h3>Dónde está cada cosa</h3>
        <dl className="help-places">
          {places.map(([name, text]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <h3>Atajos de teclado</h3>
        <ul className="help-shortcuts">
          {shortcuts.map(([keys, text]) => (
            <li key={text}>
              <Kbd keys={keys} />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <Button onClick={onClose}>Entendido</Button>
        </div>
      </div>
    </Modal>
  );
}
