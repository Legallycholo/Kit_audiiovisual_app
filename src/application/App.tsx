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
  PanelLeftClose,
  Search,
  Send,
  Settings,
  Sparkles,
  Users,
  WandSparkles,
  X,
  Layers3,
  ChartNoAxesCombined,
  CheckCheck,
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
const navigation = [
  {
    label: "Overview",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/events", label: "Events", icon: CalendarDays },
      { to: "/clients", label: "Clients", icon: Users },
      { to: "/venues", label: "Venues", icon: MapPin },
    ],
  },
  {
    label: "Create & connect",
    items: [
      { to: "/design", label: "Design Studio", icon: Layers3 },
      { to: "/creative", label: "AI Creative Studio", icon: WandSparkles },
      { to: "/proposals", label: "Proposals", icon: FileText },
      { to: "/inbox", label: "Client Inbox", icon: MessageCircle },
    ],
  },
  {
    label: "Production",
    items: [
      { to: "/inventory", label: "Equipment & Inventory", icon: Box },
      { to: "/production", label: "Team & Production", icon: Users },
      { to: "/reports", label: "Reports", icon: ChartNoAxesCombined },
    ],
  },
];
export function App() {
  const { data, notice, toast, storageError } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [assistant, setAssistant] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [search, setSearch] = useState<string | null>(null);
  const [notifications, setNotifications] = useState(false);
  const [help, setHelp] = useState(false);
  const currentLabel =
    navigation
      .flatMap((n) => n.items)
      .find((n) => n.to !== "/" && location.pathname.startsWith(n.to))?.label ||
    (location.pathname.startsWith("/settings") ? "Settings" : "Dashboard");
  const pending = data.conversations.filter(
    (c) => c.review === "Pending",
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
            type: "Event",
            to: `/events/${e.id}`,
          })),
          ...data.clients.map((c) => ({
            title: c.name,
            type: "Client",
            to: `/clients?client=${c.id}`,
          })),
          ...data.proposals.map((p) => ({
            title: `${p.number} · ${p.title}`,
            type: "Proposal",
            to: `/proposals/${p.id}`,
          })),
          ...navigation
            .flatMap((n) => n.items)
            .map((n) => ({ title: n.label, type: "Workspace", to: n.to })),
        ].filter((r) => r.title.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className={`app ${assistant ? "assistant-open" : ""}`}>
      <a href="#main" className="skip-link">
        Skip to workspace
      </a>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
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
            <small>Company workspace</small>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav aria-label="Main navigation">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink end={item.to === "/"} key={item.to} to={item.to}>
                  <item.icon size={18} strokeWidth={1.7} />
                  <span>{item.label}</span>
                  {item.to === "/inbox" && pending > 0 && (
                    <span className="nav-count">{pending}</span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="sidebar-ai"
            onClick={() => setAssistant(!assistant)}
          >
            <Sparkles size={18} />
            <span>
              Your production copilot<small>Plan a little smarter</small>
            </span>
            <ArrowUpRight size={15} />
          </button>
          <NavLink to="/settings">
            <Settings size={18} />
            Settings
          </NavLink>
          <button className="sidebar-help" onClick={() => setHelp(true)}>
            <CircleHelp size={18} />
            Help & workspace guide
          </button>
          <div className="sidebar-profile">
            <Avatar label="AM" />
            <div>
              <strong>Alex Morgan</strong>
              <small>Owner · sample profile</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="app-body">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-button menu-toggle"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="desktop-only">Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{currentLabel}</strong>
          </div>
          <div className="topbar-actions">
            <button className="global-search" onClick={() => setSearch("")}>
              <Search size={16} />
              <span>Search anything…</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`Notifications, ${pending} awaiting review`}
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={19} />
              {pending > 0 && <i />}
            </button>
            <span className="topbar-separator" />
            <button
              className={`assistant-toggle ${assistant ? "selected" : ""}`}
              onClick={() => setAssistant(!assistant)}
            >
              <Sparkles size={16} />
              <span>Ask KIT</span>
            </button>
          </div>
        </header>
        <div className="sample-banner">
          <span>
            <span className="live-dot" />
            Sample workspace
          </span>
          <span>Illustrative records · saved on this device</span>
          <Link to="/settings">
            Manage workspace
            <ArrowUpRight size={12} />
          </Link>
        </div>
        {storageError && (
          <div className="error-note" role="alert">
            {storageError}
          </div>
        )}
        <main id="main" className="main-workspace">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:eventId" element={<EventDetail />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/venues" element={<Venues />} />
            <Route path="/design" element={<Design />} />
            <Route path="/creative" element={<Creative />} />
            <Route path="/proposals" element={<Proposals />} />
            <Route path="/proposals/:proposalId" element={<ProposalEditor />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/production" element={<Production />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>This page isn't in the workspace.</h1>
                  <Link className="button primary" to="/">
                    Back to dashboard
                  </Link>
                </div>
              }
            />
          </Routes>
        </main>
      </div>
      {assistant && (
        <Assistant page={currentLabel} onClose={() => setAssistant(false)} />
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={17} />
          {notice}
          <button aria-label="Dismiss notification" onClick={() => toast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {notifications && (
        <div className="notification-popover">
          <div className="panel-heading">
            <h2>Needs your attention</h2>
            <button
              className="icon-button"
              aria-label="Close notifications"
              onClick={() => setNotifications(false)}
            >
              <X size={18} />
            </button>
          </div>
          {data.conversations
            .filter((c) => c.review === "Pending")
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
                  <strong>Review client acceptance</strong>
                  <small>
                    {
                      data.clients.find((client) => client.id === c.clientId)
                        ?.name
                    }{" "}
                    · revision {c.proposalVersion}
                  </small>
                  <Badge>Awaiting owner review</Badge>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          {pending === 0 && (
            <div className="empty compact">
              <CheckCheck size={25} />
              <h3>You're all caught up.</h3>
              <p>No acceptance requests awaiting review.</p>
            </div>
          )}
        </div>
      )}
      {search !== null && (
        <Modal title="Search your workspace" onClose={() => setSearch(null)}>
          <label className="command-search">
            <Search size={21} />
            <input
              autoFocus
              placeholder="Events, clients, proposals, pages…"
              aria-label="Search workspace records"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Command size={17} />
          </label>
          <div className="search-results">
            {results.slice(0, 12).map((r) => (
              <button
                key={`${r.type}-${r.to}`}
                onClick={() => {
                  navigate(r.to);
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
              <p className="muted">No results. Try a customer or event name.</p>
            )}
          </div>
        </Modal>
      )}
      {help && (
        <Modal
          title="Welcome to your production workspace"
          onClose={() => setHelp(false)}
        >
          <div className="modal-body">
            <p>
              Start with a client and event. Add the venue and equipment,
              prepare a proposal, then coordinate your production team.
            </p>
            <p className="muted">
              This local workspace uses illustrative records. AI, WhatsApp,
              authentication, and shared cloud storage are not connected yet. No
              messages leave the app.
            </p>
            <Button onClick={() => setHelp(false)}>
              Explore the workspace
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Assistant({ page, onClose }: { page: string; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const location = useLocation();
  return (
    <aside className="assistant">
      <header>
        <div>
          <Sparkles size={20} />
          <strong>KIT assistant</strong>
        </div>
        <button
          className="icon-button"
          aria-label="Close assistant"
          onClick={onClose}
        >
          <PanelLeftClose size={18} />
        </button>
      </header>
      <div className="assistant-context">
        <span className="live-dot" />
        Context: {page}
        <small>{location.pathname}</small>
      </div>
      <div className="assistant-content">
        <div className="assistant-orb">
          <Sparkles size={26} />
        </div>
        <h2>
          A little help.
          <br />A better production.
        </h2>
        <p>
          Bring your next event into focus with a copilot that understands your
          workspace.
        </p>
        <Badge tone="neutral">AI not connected</Badge>
        <div className="prompt-suggestions">
          {[
            "Draft a proposal for this event",
            "Summarize upcoming production tasks",
            "Help me plan an equipment list",
          ].map((text) => (
            <button key={text} onClick={() => setPrompt(text)}>
              {text}
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
        {messages.map((message, i) => (
          <div className="assistant-message" key={i}>
            <strong>You</strong>
            <p>{message}</p>
            <div className="assistant-response">
              Your request is saved in this session. Connect an AI service to
              generate a response. You can prepare and edit proposals in the
              meantime.
              <Link to="/proposals">
                Open proposals <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
        ))}
      </div>
      <form
        className="assistant-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (prompt.trim()) {
            setMessages([...messages, prompt]);
            setPrompt("");
          }
        }}
      >
        <textarea
          aria-label="Ask KIT"
          placeholder="What are we working on?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div>
          <small>Drafts always stay in your control.</small>
          <button
            className="icon-button"
            aria-label="Save assistant request"
            disabled={!prompt.trim()}
          >
            <Send size={17} />
          </button>
        </div>
      </form>
    </aside>
  );
}
