import { uiLabel } from "../shared/i18n";
import { canSeeModule } from "../shared/access";
import { initials } from "../shared/domain";
import { useEffect, useState } from "react";
import {
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  ArrowUpRight,
  Bell,
  Box,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  FileText,
  LayoutDashboard,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  Settings,
  Sparkles,
  Users,
  WandSparkles,
  X,
  Layers3,
  ChartNoAxesCombined,
  CheckCheck,
  CloudOff,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useWorkspace } from "../shared/store";
import { Avatar, Badge, Button, Modal } from "../shared/ui";
import { Dashboard } from "../modules/Dashboard";
import { Events, EventDetail } from "../modules/Events";
import { Clients, Venues } from "../modules/Directory";
import { Proposals, ProposalEditor } from "../modules/Proposals";
import { Inbox } from "../modules/Inbox";
import { Inventory } from "../modules/Inventory";
import {
  Production,
  Reports,
  SettingsPage,
  Creative,
} from "../modules/Operations";
import { Design } from "../modules/Design";
import { WorkspaceTabs } from "./WorkspaceTabs";
import { DraftNavigation } from "./DraftNavigation";
import { hubs, activeHub, HubNavigation, LibraryHub } from "./Hubs";
import { SearchPage } from "../modules/UniversalSearch";
import { FileLibrary, FilePreview } from "../modules/FileLibrary";
import { KitChat } from "../modules/KitChat";
const navigation = [
  {
    label: uiLabel("Overview"),
    items: [
      { to: "/", label: uiLabel("Dashboard"), icon: LayoutDashboard },
      { to: "/events", label: uiLabel("Events"), icon: CalendarDays },
      { to: "/clients", label: uiLabel("Clients"), icon: Users },
      { to: "/venues", label: uiLabel("Venues"), icon: MapPin },
    ],
  },
  {
    label: uiLabel("Create & connect"),
    items: [
      { to: "/design", label: uiLabel("Design Studio"), icon: Layers3 },
      {
        to: "/creative",
        label: uiLabel("AI Creative Studio"),
        icon: WandSparkles,
      },
      { to: "/proposals", label: uiLabel("Proposals"), icon: FileText },
      { to: "/inbox", label: uiLabel("Client Inbox"), icon: MessageCircle },
    ],
  },
  {
    label: uiLabel("Production"),
    items: [
      { to: "/inventory", label: uiLabel("Equipment & Inventory"), icon: Box },
      { to: "/production", label: uiLabel("Team & Production"), icon: Users },
      { to: "/reports", label: uiLabel("Reports"), icon: ChartNoAxesCombined },
    ],
  },
];
export function App() {
  const {
    data,
    notice,
    toast,
    storageError,
    user,
    mode,
    saving,
    openCompany,
    signOut,
    refresh,
    sync,
    retrySync,
    resolveSync,
  } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [assistant, setAssistant] = useState(false);
  const shellKey = `kit.shell:${mode}:${user?.id || "sample"}`;
  useEffect(() => {
    try {
      setAssistant(localStorage.getItem(shellKey + ":assistant") === "true");
    } catch {
      /* Continue without saved preferences. */
    }
  }, [shellKey]);
  const toggleAssistant = (open: boolean) => {
    setAssistant(open);
    try {
      localStorage.setItem(shellKey + ":assistant", String(open));
    } catch {
      toast("No se pudo guardar la preferencia del asistente.");
    }
  };
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("kit.theme") || "system",
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    localStorage.setItem("kit.theme", theme);
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  const currentLabel =
    (
      {
        "/library": "Biblioteca",
        "/library/files": "Archivos del equipo",
        "/kit": "KIT",
        "/search": "Buscar",
      } as Record<string, string>
    )[location.pathname] ||
    navigation
      .flatMap((n) => n.items)
      .find((n) => n.to !== "/" && location.pathname.startsWith(n.to))?.label ||
    (location.pathname.startsWith("/files/")
      ? "Archivo"
      : location.pathname.startsWith("/settings")
        ? uiLabel("Settings")
        : uiLabel("Dashboard"));
  const pending = data.conversations.filter((c) =>
    ["Pending", "Needs linking"].includes(c.review),
  ).length;
  useEffect(() => {
    setMobileNav(false);
    document.title = `${currentLabel} · KIT`;
  }, [location.pathname, currentLabel]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => toast(""), 5500);
    return () => clearTimeout(timeout);
  }, [notice, toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch("");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const results =
    search === null
      ? []
      : [
          ...data.events.map((e) => ({
            title: e.name,
            type: uiLabel("Event"),
            to: `/events/${e.id}`,
          })),
          ...data.clients.map((c) => ({
            title: c.name,
            type: uiLabel("Client"),
            to: `/clients?client=${c.id}`,
          })),
          ...data.proposals.map((p) => ({
            title: `${p.number} · ${p.title}`,
            type: uiLabel("Proposal"),
            to: `/proposals/${p.id}`,
          })),
          ...navigation
            .flatMap((n) => n.items)
            .map((n) => ({
              title: n.label,
              type: uiLabel("Workspace"),
              to: n.to,
            })),
        ].filter(
          (r) =>
            canSeeModule(user, r.to) &&
            r.title.toLowerCase().includes(search.toLowerCase()),
        );
  return (
    <div className={`app ${assistant ? "assistant-open" : ""}`}>
      <DraftNavigation />
      <a href="#main" className="skip-link">
        {uiLabel("Skip to workspace")}
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label={uiLabel("Close navigation")}
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <Link className="brand" to="/" aria-label="KIT home">
          <span className="brand-mark">
            kıt<span className="brand-dot">.</span>
          </span>
          <span className="brand-caption">
            PRODUCTION
            <br />
            WORKSPACE
          </span>
        </Link>
        <div className="workspace-switch">
          <span className="workspace-icon">K</span>
          <div>
            <strong>{data.settings.company}</strong>
            <small>Espacio de empresa</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav aria-label={uiLabel("Main navigation")}>
          {hubs.map((hub, index) => {
            const path = hub.pages.find(([p]) => canSeeModule(user, p))?.[0];
            const Icon = [
              LayoutDashboard,
              CalendarDays,
              Layers3,
              Box,
              Sparkles,
            ][index];
            return (
              path && (
                <Link
                  key={hub.to}
                  to={path}
                  className={
                    activeHub(location.pathname) === hub ? "active" : ""
                  }
                  aria-current={
                    activeHub(location.pathname) === hub ? "page" : undefined
                  }
                >
                  <Icon size={18} />
                  <span>{hub.title}</span>
                </Link>
              )
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <label className="theme-picker">
            Apariencia
            <select
              aria-label="Apariencia"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            >
              <option value="system">Sistema</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
          <NavLink to="/settings">
            <Settings size={18} />
            {uiLabel("Settings")}
          </NavLink>
          <button className="sidebar-help" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            {uiLabel("Help & workspace guide")}
          </button>
          <div className="sidebar-profile">
            <Avatar label={user ? initials(user.name) : "AM"} />
            <div>
              <strong>{user?.name || "Alex Morgan"}</strong>
              <small>
                {user
                  ? user.isOwner
                    ? "Propietario"
                    : uiLabel(user.role)
                  : "Propietario · perfil de ejemplo"}
              </small>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-toggle"
              aria-label={uiLabel("Open navigation")}
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="desktop-only">{uiLabel("Workspace")}</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{currentLabel}</strong>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setSearch("")}>
              <Search size={16} />
              <span>{uiLabel("Search anything\u2026")}</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`Notificaciones: ${pending} pendientes de revisión`}
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              {pending > 0 && <i />}
            </button>
            <span className="topbar-separator" />
            <button
              className={`assistant-toggle ${assistant ? "selected" : ""}`}
              onClick={() => toggleAssistant(!assistant)}
            >
              <Sparkles size={16} />
              <span>{uiLabel("Ask KIT")}</span>
            </button>
          </div>
        </header>
        <WorkspaceTabs
          title={
            data.events.find((e) => location.pathname === `/events/${e.id}`)
              ?.name ||
            data.proposals.find(
              (p) => location.pathname === `/proposals/${p.id}`,
            )?.title ||
            (location.pathname === "/search"
              ? `Búsqueda: ${new URLSearchParams(location.search).get("q") || "Nueva"}`
              : location.pathname === "/library"
                ? "Biblioteca"
                : location.pathname === "/kit"
                  ? "KIT"
                  : currentLabel)
          }
        />
        <HubNavigation />
        <div className="sample-banner">
          <span>
            <span className="live-dot" />
            {mode === "sample" ? "Espacio de ejemplo" : data.settings.company}
          </span>
          <span>
            {mode === "sample"
              ? "Datos ilustrativos · guardados en este dispositivo"
              : sync.state === "queued"
                ? "Sin conexión · 1 guardado cifrado pendiente"
                : sync.state === "conflict"
                  ? "Conflicto de sincronización · requiere revisión"
                  : sync.state === "syncing"
                    ? "Sincronizando cambios pendientes…"
                    : saving
                      ? "Guardando…"
                      : "Espacio de empresa · datos en el servidor"}
          </span>
          {mode === "sample" ? (
            <button
              onClick={async () => {
                if (
                  !("__TAURI_INTERNALS__" in window) ||
                  window.location.port === "3001"
                ) {
                  openCompany();
                  return;
                }
                try {
                  const { invoke } = await import("@tauri-apps/api/core");
                  await invoke("open_company_window");
                } catch {
                  toast(
                    "Inicia el servidor de empresa con npm start en el puerto 3001 y vuelve a intentarlo.",
                  );
                }
              }}
            >
              Abrir espacio de empresa <ArrowUpRight size={12} />
            </button>
          ) : (
            <span className="workspace-actions">
              <button
                disabled={saving}
                onClick={() =>
                  sync.pending ? void retrySync() : void refresh()
                }
              >
                {sync.pending ? "Reintentar sincronización" : "Actualizar"}
              </button>
              <button
                disabled={saving || Boolean(sync.pending)}
                onClick={signOut}
              >
                Cerrar sesión
              </button>
            </span>
          )}
        </div>
        {mode === "company" && sync.pending && (
          <section
            className={`sync-review ${sync.state === "conflict" ? "conflict" : "queued"}`}
            aria-label="Estado de sincronización"
            aria-live="polite"
          >
            {sync.state === "conflict" ? (
              <TriangleAlert size={18} />
            ) : sync.state === "syncing" ? (
              <RefreshCw size={18} />
            ) : (
              <CloudOff size={18} />
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
          <div className="error-note" role="alert">
            {storageError}
            {mode === "company" && (
              <button onClick={refresh}>Actualizar datos</button>
            )}
          </div>
        )}
        <main id="main" className="main-workspace">
          {canSeeModule(user, location.pathname) ? (
            <Routes>
              <Route path="/library" element={<LibraryHub />} />
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
          ) : (
            <div className="empty">
              <h1>Acceso restringido</h1>
              <p>Tu cuenta no tiene acceso a esta sección.</p>
              <Link to="/">Volver al inicio</Link>
            </div>
          )}
        </main>
      </div>
      {assistant && <KitChat sidebar onClose={() => toggleAssistant(false)} />}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button
            aria-label={uiLabel("Dismiss notification")}
            onClick={() => toast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {notifications && (
        <div className="notification-popover">
          <div className="panel-heading">
            <h2>{uiLabel("Needs your attention")}</h2>
            <button
              className="icon-button"
              aria-label={uiLabel("Close notifications")}
              onClick={() => setNotifications(false)}
            >
              <X size={18} />
            </button>
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
                  <MessageCircle size={19} />
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
                <ArrowUpRight size={16} />
              </button>
            ))}
          {pending === 0 && (
            <div className="empty compact">
              <CheckCheck size={25} />
              <h3>{uiLabel("You're all caught up.")}</h3>
              <p>{uiLabel("No acceptance requests awaiting review.")}</p>
            </div>
          )}
        </div>
      )}
      {search !== null && (
        <Modal
          title={uiLabel("Search your workspace")}
          onClose={() => setSearch(null)}
        >
          <label className="command-search">
            <Search size={21} />
            <input
              autoFocus
              placeholder={uiLabel("Events, clients, proposals, pages\u2026")}
              aria-label={uiLabel("Search workspace records")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search.trim()) {
                  const path = `/search?q=${encodeURIComponent(search.trim())}`;
                  window.dispatchEvent(
                    new CustomEvent("kit:navigate", {
                      detail: () => navigate(path),
                    }),
                  );
                  setSearch(null);
                }
              }}
            />
            <Command size={17} />
          </label>
          <div className="search-results">
            {results.slice(0, 12).map((r) => (
              <button
                key={`${r.type}-${r.to}`}
                onClick={() => {
                  window.dispatchEvent(new Event("kit:preview"));
                  window.dispatchEvent(
                    new CustomEvent("kit:navigate", {
                      detail: () => navigate(r.to),
                    }),
                  );
                  setSearch(null);
                }}
              >
                <span>
                  {r.title}
                  <small>{r.type}</small>
                </span>
                <ArrowUpRight size={17} />
              </button>
            ))}
            {results.length === 0 && (
              <p className="muted">
                No hay resultados. Prueba con un cliente o evento.
              </p>
            )}
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title={uiLabel("Welcome to your production workspace")}
          onClose={() => setHelp(false)}
        >
          <div className="modal-body">
            <p>
              Comienza con un cliente y un evento. Agrega el lugar y los
              equipos, prepara una propuesta y coordina al equipo de producción.
            </p>
            <p className="muted">
              Este espacio de ejemplo usa datos ilustrativos. La mensajería real
              y el almacenamiento de archivos todavía no están conectados.
              Ningún mensaje sale de la aplicación.
            </p>
            <Button onClick={() => setHelp(false)}>
              {uiLabel("Explore the workspace")}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
