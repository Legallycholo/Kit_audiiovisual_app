import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  ExternalLink,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Settings,
  UserRound,
} from "lucide-react";
import { useWorkspace } from "../shared/store";
import { useAppearance } from "../shared/appearance";
import { initials } from "../shared/domain";
import { uiLabel } from "../shared/i18n";
import {
  Kbd,
  MenuList,
  Popover,
  SegmentedControl,
  StatusDot,
  Tooltip,
  type StatusTone,
} from "../shared/ui";
import {
  activeDestination,
  itemMatches,
  settingsDestination,
  visibleDestinations,
  visibleSettingsSections,
  type NavDestination,
  type NavItem,
} from "./navigation";

const FOCUSABLE =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input, select, textarea';

export function Sidebar({
  collapsed,
  onToggleCollapsed,
  mobile,
  mobileOpen,
  onCloseMobile,
  onOpenPalette,
  onOpenHelp,
  pendingCount,
  bookingUrl,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobile: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenPalette: () => void;
  onOpenHelp: () => void;
  pendingCount: number;
  bookingUrl?: string;
}) {
  const { user, mode } = useWorkspace();
  const { pathname } = useLocation();
  const ref = useRef<HTMLElement>(null);
  // On phones the sidebar is a drawer and always shows labels.
  const compact = collapsed && !mobile;
  const items = visibleDestinations(user);
  const settings: NavDestination = {
    ...settingsDestination,
    to: visibleSettingsSections(user, mode)[0].to,
    children: visibleSettingsSections(user, mode),
  };
  useEffect(() => {
    if (!mobile || !mobileOpen) return;
    const first = ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
  }, [mobile, mobileOpen]);
  const trap = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!mobile || !mobileOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseMobile();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
    ).filter((el) => el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const drawer = mobile && mobileOpen;
  return (
    <aside
      ref={ref}
      className={`sidebar ${compact ? "collapsed" : ""} ${drawer ? "open" : ""}`}
      aria-label={uiLabel(drawer ? "Navigation menu" : "Sidebar")}
      role={drawer ? "dialog" : undefined}
      aria-modal={drawer || undefined}
      onKeyDown={trap}
    >
      <Link className="brand" to="/" aria-label={uiLabel("KIT home")}>
        <img
          className={`brand-logo ${compact ? "mark" : ""}`}
          src={compact ? "/kit-mark.png" : "/kit-logo.png"}
          alt="KIT audiovisual"
        />
      </Link>
      <nav className="sidebar-nav" aria-label={uiLabel("Main navigation")}>
        <ul className="sidebar-group">
          {items.map((item) => (
            <SidebarItem
              key={item.id}
              item={item}
              compact={compact}
              pathname={pathname}
              badges={{ unread: pendingCount }}
            />
          ))}
        </ul>
        <hr className="sidebar-divider" />
        <ul className="sidebar-group">
          <li>
            <SidebarRowTooltip
              compact={compact}
              label="Buscar"
              shortcut={<Kbd keys={["mod", "K"]} />}
            >
              <button
                type="button"
                className="sidebar-row"
                onClick={onOpenPalette}
                aria-label={compact ? uiLabel("Buscar") : undefined}
              >
                <Search size={18} aria-hidden="true" />
                <span className="sidebar-label">{uiLabel("Buscar")}</span>
                <span className="sidebar-trailing">
                  <Kbd keys={["mod", "K"]} />
                </span>
              </button>
            </SidebarRowTooltip>
          </li>
          <SidebarItem
            item={settings}
            compact={compact}
            pathname={pathname}
            badges={{}}
          />
        </ul>
        {!mobile && (
          <button
            type="button"
            className="sidebar-row sidebar-collapse"
            onClick={onToggleCollapsed}
            aria-label={uiLabel(
              collapsed ? "Expand sidebar" : "Collapse sidebar",
            )}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} aria-hidden="true" />
            ) : (
              <PanelLeftClose size={18} aria-hidden="true" />
            )}
            <span className="sidebar-label">{uiLabel("Collapse sidebar")}</span>
            <span className="sidebar-trailing">
              <Kbd keys={["mod", "\\"]} />
            </span>
          </button>
        )}
      </nav>
      <div className="sidebar-footer">
        <ul className="sidebar-group">
          <li>
            <SidebarRowTooltip compact={compact} label="Ayuda">
              <button
                type="button"
                className="sidebar-row"
                onClick={onOpenHelp}
                aria-label={compact ? uiLabel("Ayuda") : undefined}
              >
                <CircleHelp size={18} aria-hidden="true" />
                <span className="sidebar-label">{uiLabel("Ayuda")}</span>
              </button>
            </SidebarRowTooltip>
          </li>
          {bookingUrl && (
            <li>
              <SidebarRowTooltip compact={compact} label="Página de reservas">
                <a
                  className="sidebar-row"
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={
                    compact ? uiLabel("Página de reservas") : undefined
                  }
                >
                  <ExternalLink size={18} aria-hidden="true" />
                  <span className="sidebar-label">
                    {uiLabel("Página de reservas")}
                  </span>
                  <span className="sidebar-trailing">
                    <ExternalLink size={14} aria-hidden="true" />
                  </span>
                </a>
              </SidebarRowTooltip>
            </li>
          )}
        </ul>
        <UserChip compact={compact} />
      </div>
    </aside>
  );
}

function SidebarRowTooltip({
  compact,
  label,
  shortcut,
  children,
}: {
  compact: boolean;
  label: string;
  shortcut?: ReactNode;
  children: ReactElement;
}) {
  if (!compact) return children;
  return (
    <Tooltip
      placement="right-start"
      label={
        <span className="tooltip-row">
          {uiLabel(label)}
          {shortcut}
        </span>
      }
    >
      {children}
    </Tooltip>
  );
}

function SidebarItem({
  item,
  compact,
  pathname,
  badges,
}: {
  item: NavDestination;
  compact: boolean;
  pathname: string;
  badges: { unread?: number };
}) {
  const Icon = item.icon;
  const inside =
    itemMatches(item, pathname) ||
    Boolean(item.children?.some((child) => itemMatches(child, pathname)));
  const current = activeDestination(pathname)?.id === item.id && inside;
  const [open, setOpen] = useState(current);
  const [popover, setPopover] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const submenuId = useId();
  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);
  const close = useCallback(() => setPopover(false), []);
  const count = item.children?.reduce(
    (sum, child) => sum + (child.badge ? badges[child.badge] || 0 : 0),
    0,
  );
  if (!item.children) {
    return (
      <li>
        <SidebarRowTooltip
          compact={compact}
          label={item.label}
          shortcut={item.shortcut}
        >
          <Link
            to={item.to}
            className={`sidebar-row ${current ? "active" : ""}`}
            aria-current={current ? "page" : undefined}
            aria-label={compact ? uiLabel(item.label) : undefined}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="sidebar-label">{uiLabel(item.label)}</span>
          </Link>
        </SidebarRowTooltip>
      </li>
    );
  }
  if (compact)
    return (
      <li>
        <SidebarRowTooltip compact label={item.label}>
          <button
            ref={anchor}
            type="button"
            className={`sidebar-row ${current ? "active" : ""}`}
            aria-label={uiLabel(item.label)}
            aria-haspopup="menu"
            aria-expanded={popover}
            aria-current={current ? "page" : undefined}
            onClick={() => setPopover((value) => !value)}
          >
            <Icon size={18} aria-hidden="true" />
            {count ? <span className="sidebar-dot" aria-hidden="true" /> : null}
          </button>
        </SidebarRowTooltip>
        <Popover
          anchor={anchor}
          open={popover}
          onClose={close}
          placement="right-start"
          className="menu-popover sidebar-flyout"
        >
          <div className="sidebar-flyout-title">{uiLabel(item.label)}</div>
          <MenuList
            label={item.label}
            onDone={close}
            items={item.children.map((child) => ({
              label: child.label,
              to: child.to,
              shortcut:
                child.badge && badges[child.badge] ? (
                  <span className="sidebar-count">{badges[child.badge]}</span>
                ) : undefined,
            }))}
          />
        </Popover>
      </li>
    );
  return (
    <li className={`sidebar-parent ${open ? "expanded" : ""}`}>
      <div className="sidebar-parent-row">
        <Link
          to={item.to}
          className={`sidebar-row ${current ? "active" : ""}`}
          aria-current={current && !open ? "page" : undefined}
          onClick={() => setOpen(true)}
        >
          <Icon size={18} aria-hidden="true" />
          <span className="sidebar-label">{uiLabel(item.label)}</span>
          {!open && count ? (
            <span
              className="sidebar-count"
              aria-label={`${count} ${uiLabel("pending")}`}
            >
              {count}
            </span>
          ) : null}
        </Link>
        <button
          type="button"
          className="sidebar-chevron"
          aria-expanded={open}
          aria-controls={submenuId}
          aria-label={`${uiLabel(open ? "Hide" : "Show")} ${uiLabel(item.label)}`}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <ul id={submenuId} className="sidebar-submenu" hidden={!open}>
        {item.children.map((child) => (
          <SidebarChild
            key={child.id}
            child={child}
            pathname={pathname}
            count={child.badge ? badges[child.badge] : 0}
          />
        ))}
      </ul>
    </li>
  );
}

function SidebarChild({
  child,
  pathname,
  count,
}: {
  child: NavItem;
  pathname: string;
  count?: number;
}) {
  const active = itemMatches(child, pathname);
  return (
    <li>
      <Link
        to={child.to}
        className={`sidebar-subrow ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
      >
        <span className="sidebar-label">{uiLabel(child.label)}</span>
        {count ? (
          <span
            className="sidebar-count"
            aria-label={`${count} ${uiLabel("pending")}`}
          >
            {count}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** Sync state shown on the avatar: saved, syncing, or needs attention. */
export function useSyncStatus(): { tone: StatusTone; label: string } {
  const { saving, sync, storageError } = useWorkspace();
  if (sync.state === "conflict")
    return { tone: "danger", label: uiLabel("Sync conflict · needs review") };
  if (sync.state === "queued")
    return { tone: "danger", label: uiLabel("Offline · save waiting") };
  if (sync.state === "syncing" || saving)
    return { tone: "info", label: uiLabel("Syncing…") };
  if (storageError) return { tone: "danger", label: uiLabel("Not saved") };
  return { tone: "success", label: uiLabel("All changes saved") };
}

/** The person at the bottom of the sidebar, with the account menu. */
export function UserChip({ compact }: { compact: boolean }) {
  const { user, savedCount, sync, saving, signOut, refresh, retrySync } =
    useWorkspace();
  const { appearance, setAppearance } = useAppearance();
  const status = useSyncStatus();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const name = user?.name || "";
  const role = user?.isOwner
    ? uiLabel("Propietario")
    : uiLabel(user?.role || "");
  const avatar = initials(name);
  const done = (action?: () => void) => {
    setOpen(false);
    action?.();
  };
  return (
    <div className="user-chip-wrap">
      <button
        ref={anchor}
        type="button"
        className="user-chip"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`${uiLabel("Account")}: ${name} · ${role} · ${status.label}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar">
          <span className="avatar small">{avatar}</span>
          <StatusDot
            tone={status.tone}
            label={status.label}
            pulseKey={savedCount}
            className="user-status"
          />
        </span>
        {!compact && (
          <>
            <span className="user-text">
              <strong>{name}</strong>
              <small>{role}</small>
            </span>
            <ChevronsUpDown size={16} aria-hidden="true" />
          </>
        )}
      </button>
      <Popover
        anchor={anchor}
        open={open}
        onClose={close}
        placement={compact ? "right-end" : "top-start"}
        className="account-menu"
        role="dialog"
        label={uiLabel("Account")}
      >
        <div className="account-head">
          <span className="avatar">{avatar}</span>
          <span>
            <strong>{name}</strong>
            <small>{user?.email}</small>
          </span>
        </div>
        <div className="account-status">
          <StatusDot tone={status.tone} label={status.label} />
          <span>{status.label}</span>
          {sync.pending && (
            <a href="#sync-review" className="text-link" onClick={close}>
              {uiLabel("Review")}
            </a>
          )}
        </div>
        <div className="account-section">
          <SegmentedControl
            label="Theme"
            value={appearance.theme}
            onChange={(theme) => setAppearance({ theme })}
            options={[
              { value: "light", label: "Claro" },
              { value: "dark", label: "Oscuro" },
              { value: "system", label: "Sistema" },
            ]}
          />
        </div>
        <div className="account-actions">
          <Link className="menu-item" to="/settings/users" onClick={close}>
            <UserRound size={16} aria-hidden="true" />
            {uiLabel("My account")}
          </Link>
          <Link className="menu-item" to="/settings" onClick={close}>
            <Settings size={16} aria-hidden="true" />
            {uiLabel("Settings")}
          </Link>
          <button
            type="button"
            className="menu-item"
            disabled={saving}
            onClick={() =>
              done(() => void (sync.pending ? retrySync() : refresh()))
            }
          >
            <RefreshCw size={16} aria-hidden="true" />
            {uiLabel(sync.pending ? "Retry sync" : "Refresh data")}
          </button>
          <button
            type="button"
            className="menu-item danger"
            disabled={saving || Boolean(sync.pending)}
            onClick={() => done(() => void signOut())}
          >
            <LogOut size={16} aria-hidden="true" />
            {uiLabel("Sign out")}
          </button>
        </div>
      </Popover>
    </div>
  );
}
