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

/** The six top-level destinations, in sidebar order. */
export const destinations: NavDestination[] = [
  {
    id: "home",
    label: "Inicio",
    to: "/",
    icon: LayoutDashboard,
    children: [
      { id: "summary", label: "Resumen", to: "/" },
      { id: "reports", label: "Informes", to: "/reports" },
    ],
  },
  {
    id: "events",
    label: "Eventos",
    to: "/events",
    icon: CalendarDays,
    children: [
      { id: "event-list", label: "Eventos", to: "/events" },
      { id: "production", label: "Producción", to: "/production" },
    ],
  },
  {
    id: "sales",
    label: "Ventas",
    to: "/proposals",
    icon: FileText,
    children: [
      { id: "proposals", label: "Propuestas", to: "/proposals" },
      { id: "inbox", label: "Mensajes", to: "/inbox", badge: "unread" },
      { id: "clients", label: "Clientes", to: "/clients" },
    ],
  },
  {
    id: "design",
    label: "Diseño",
    to: "/design",
    icon: Layers3,
    children: [
      { id: "plans", label: "Planos y 3D", to: "/design" },
      { id: "creative", label: "Estudio creativo", to: "/creative" },
    ],
  },
  {
    id: "resources",
    label: "Recursos",
    to: "/inventory",
    icon: Box,
    children: [
      { id: "equipment", label: "Equipos", to: "/inventory" },
      { id: "venues", label: "Lugares", to: "/venues" },
      {
        id: "files",
        label: "Archivos",
        to: "/library/files",
        match: ["/files/"],
      },
    ],
  },
  { id: "kit", label: "KIT", to: "/kit", icon: Sparkles },
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
  mode: "sample" | "company",
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
  mode: "sample" | "company",
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
