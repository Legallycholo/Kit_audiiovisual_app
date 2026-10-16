export type ResourceKind =
  | "page"
  | "project"
  | "proposal"
  | "design"
  | "search"
  | "file"
  | "chat"
  | "output";
export interface WorkspaceTab {
  id: string;
  key: string;
  route: string;
  title: string;
  kind: ResourceKind;
  pinned: boolean;
  preview: boolean;
}
export interface HistoryItem {
  id: string;
  route: string;
  title: string;
  kind: ResourceKind;
  at: string;
}
export interface SessionSnapshot {
  version: 1;
  tabs: WorkspaceTab[];
  active: string;
  closed: WorkspaceTab[];
  history: HistoryItem[];
  trail: string[];
  cursor: number;
  clean: boolean;
}
export const emptySession = (): SessionSnapshot => ({
  version: 1,
  tabs: [],
  active: "",
  closed: [],
  history: [],
  trail: [],
  cursor: -1,
  clean: true,
});
export function canonicalRoute(route: string) {
  const url = new URL(route, "https://kit.local");
  url.searchParams.delete("new");
  url.searchParams.sort();
  return (
    url.pathname.replace(/\/$/, "") + (url.search ? url.search : "") || "/"
  );
}
export function resourceKind(route: string): ResourceKind {
  if (route.startsWith("/files/")) return "file";
  if (route.startsWith("/search")) return "search";
  if (route.startsWith("/events/")) return "project";
  if (route.startsWith("/proposals/")) return "proposal";
  if (route.startsWith("/design")) return "design";
  if (route.startsWith("/kit")) return "chat";
  return "page";
}
export function openTab(
  state: SessionSnapshot,
  route: string,
  title: string,
  preview = false,
): SessionSnapshot {
  const key = canonicalRoute(route);
  const existing = state.tabs.find((t) => t.key === key);
  const tab: WorkspaceTab = existing
    ? { ...existing, title, route }
    : {
        id: crypto.randomUUID(),
        key,
        route,
        title,
        kind: resourceKind(route),
        pinned: false,
        preview,
      };
  const tabs = existing
    ? state.tabs.map((t) => (t.id === tab.id ? tab : t))
    : [...state.tabs.filter((t) => !preview || !t.preview || t.pinned), tab];
  const history =
    state.active === tab.id && existing?.route === route
      ? state.history
      : [
          {
            id: crypto.randomUUID(),
            route,
            title,
            kind: tab.kind,
            at: new Date().toISOString(),
          },
          ...state.history,
        ];
  const trail =
    state.trail[state.cursor] === route
      ? state.trail
      : [...state.trail.slice(0, state.cursor + 1), route];
  return {
    ...state,
    tabs,
    active: tab.id,
    history,
    trail,
    cursor: trail === state.trail ? state.cursor : trail.length - 1,
  };
}
export function readSession(raw: string | null): SessionSnapshot {
  try {
    const s = JSON.parse(raw || "null");
    if (
      s?.version !== 1 ||
      !Array.isArray(s.tabs) ||
      !Array.isArray(s.history) ||
      !Array.isArray(s.closed) ||
      !Array.isArray(s.trail)
    )
      return emptySession();
    const safe = (r: unknown): r is string =>
      typeof r === "string" && r.startsWith("/") && !r.startsWith("//");
    s.tabs = s.tabs.filter(
      (t: WorkspaceTab) =>
        safe(t.route) &&
        typeof t.id === "string" &&
        typeof t.title === "string",
    );
    s.closed = s.closed.filter(
      (t: WorkspaceTab) =>
        safe(t.route) &&
        typeof t.id === "string" &&
        typeof t.title === "string",
    );
    s.history = s.history.filter(
      (h: HistoryItem) =>
        safe(h.route) &&
        typeof h.title === "string" &&
        typeof h.at === "string" &&
        typeof h.id === "string",
    );
    s.trail = s.trail.filter(safe);
    s.active = typeof s.active === "string" ? s.active : "";
    s.cursor = Number.isInteger(s.cursor)
      ? Math.max(-1, Math.min(s.cursor, s.trail.length - 1))
      : s.trail.length - 1;
    s.clean = s.clean === true;
    return s;
  } catch {
    return emptySession();
  }
}
