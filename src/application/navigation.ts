import {
  Box,
  CalendarDays,
  FileText,
  Layers3,
  LayoutDashboard,
  Settings,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { canSeeModule, type WorkspaceUser } from "../shared/access";

/** One navigable page. Every entry points to a real route. */
export interface NavItem {
  id: string;
  label: string;
  to: string;
  /** Extra path prefixes that belong to this item (detail pages). */
  match?: string[];
  badge?: "unread";
}

export interface NavDestination extends NavItem {
  icon: LucideIcon;
  shortcut?: string;
  children?: NavItem[];
}

/** The primary streamlined destinations: Inicio, Eventos, Propuestas, and KIT AI. */
export const destinations: NavDestination[] = [
  {
    id: "home",
    label: "Inicio",
    to: "/",
    icon: LayoutDashboard,
  },
  {
    id: "events",
    label: "Eventos",
    to: "/events",
    icon: CalendarDays,
  },
  {
    id: "proposals",
    label: "Propuestas",
    to: "/proposals",
    icon: FileText,
  },
  {
    id: "kit",
    label: "KIT AI",
    to: "/kit",
    icon: Sparkles,
  },
];

/** Settings sections, reachable from the sidebar submenu and the palette. */
export const settingsSections: NavItem[] = [
  { id: "general", label: "General", to: "/settings/general" },
  { id: "users", label: "Usuarios y roles", to: "/settings/users" },
  { id: "integrations", label: "Integraciones", to: "/settings/integrations" },
  { id: "appearance", label: "Apariencia", to: "/settings/appearance" },
  { id: "data", label: "Datos", to: "/settings/data" },
];

export const settingsDestination: NavDestination = {
  id: "settings",
  label: "Configuración",
  to: "/settings",
  icon: Settings,
  children: settingsSections,
};

/**
 * Sections a person can open. Company accounts without administrator access
 * see their own account and appearance only.
 */
export function visibleSettingsSections(
  user: WorkspaceUser | null,
  mode: "company",
): NavItem[] {
  if (mode === "company" && user?.role !== "Administrator")
    return [
      { id: "users", label: "Mi cuenta", to: "/settings/users" },
      settingsSections.find((s) => s.id === "appearance")!,
    ];
  return settingsSections;
}

const pathOf = (to: string) => to.split(/[?#]/)[0];

export function itemMatches(item: NavItem, pathname: string) {
  const path = pathOf(item.to);
  if (path === "/") return pathname === "/";
  return (
    pathname === path ||
    pathname.startsWith(path + "/") ||
    (item.match ?? []).some((prefix) => pathname.startsWith(prefix))
  );
}

/**
 * Applies the access policy: children the person cannot open are removed, a
 * destination with none left is hidden, and a destination with one child
 * links straight to it without a submenu.
 */
export function visibleDestinations(
  user: WorkspaceUser | null,
  items: NavDestination[] = destinations,
): NavDestination[] {
  return items.flatMap((destination) => {
    if (!destination.children) {
      return canSeeModule(user, destination.to) ? [destination] : [];
    }
    const children = destination.children.filter((child) =>
      canSeeModule(user, child.to),
    );
    if (!children.length) return [];
    if (children.length === 1)
      return [{ ...destination, to: children[0].to, children: undefined }];
    return [
      {
        ...destination,
        to: children.some((c) => pathOf(c.to) === pathOf(destination.to))
          ? destination.to
          : children[0].to,
        children,
      },
    ];
  });
}

export function activeDestination(
  pathname: string,
  items: NavDestination[] = [...destinations, settingsDestination],
) {
  return items.find(
    (destination) =>
      itemMatches(destination, pathname) ||
      destination.children?.some((child) => itemMatches(child, pathname)),
  );
}

/** The most specific label for a path, used for titles and breadcrumbs. */
export function pageLabel(pathname: string): string {
  if (pathname === "/search") return "Buscar";
  if (pathname.startsWith("/files/")) return "Archivo";
  for (const destination of [...destinations, settingsDestination]) {
    const child = destination.children?.find(
      (item) => pathOf(item.to) !== "/" && itemMatches(item, pathname),
    );
    if (child) return child.label;
  }
  const destination = activeDestination(pathname);
  if (destination?.id === "home") return pathname === "/" ? "Inicio" : "Inicio";
  return destination?.label ?? "Inicio";
}

/** Every page the palette can jump to, filtered by access. */
export function paletteDestinations(
  user: WorkspaceUser | null,
  mode: "company",
) {
  const pages: { id: string; label: string; to: string; group: string }[] = [];
  for (const destination of visibleDestinations(user)) {
    pages.push({
      id: destination.id,
      label: destination.label,
      to: destination.to,
      group: destination.label,
    });
    for (const child of destination.children ?? [])
      if (child.label !== destination.label)
        pages.push({
          id: `${destination.id}:${child.id}`,
          label: child.label,
          to: child.to,
          group: destination.label,
        });
  }
  for (const section of visibleSettingsSections(user, mode))
    pages.push({
      id: `settings:${section.id}`,
      label: section.label,
      to: section.to,
      group: "Configuración",
    });
  return pages;
}
