import type { Workspace } from "./types";
import { canSeeModule, type WorkspaceUser } from "./access";
export interface SearchResult {
  id: string;
  title: string;
  path: string;
  type: string;
  source: "app" | "local" | "cloud" | "company";
  excerpt: string;
  reason: string;
  score: number;
}
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();
export function searchWorkspace(
  data: Workspace,
  user: WorkspaceUser | null,
  query: string,
): SearchResult[] {
  const tokens = normalize(query.trim()).split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const matches = (value: string) =>
    tokens.every((t) => normalize(value).includes(t));
  const clients = new Set(
    data.clients
      .filter((c) => matches(`${c.name} ${c.contact} ${c.email} ${c.notes}`))
      .map((c) => c.id),
  );
  const events = new Set(
    data.events
      .filter((e) => clients.has(e.clientId) || matches(`${e.name} ${e.notes}`))
      .map((e) => e.id),
  );
  const rows: SearchResult[] = [];
  function add(
    id: string,
    title: string,
    path: string,
    type: string,
    text: string,
    related = false,
  ) {
    if (!canSeeModule(user, path)) return;
    const direct = matches(`${title} ${text}`);
    if (!direct && !related) return;
    rows.push({
      id,
      title,
      path,
      type,
      source: "app",
      excerpt: text.slice(0, 350),
      reason: direct
        ? "Nombre o contenido"
        : "Relacionado con el cliente o proyecto",
      score: matches(title) ? 100 : direct ? 70 : 40,
    });
  }
  data.clients.forEach((c) =>
    add(
      c.id,
      c.name,
      `/clients?client=${c.id}`,
      "Clientes",
      `${c.contact} · ${c.email} · ${c.notes}`,
    ),
  );
  data.events.forEach((e) =>
    add(
      e.id,
      e.name,
      `/events/${e.id}`,
      "Proyectos",
      e.notes,
      clients.has(e.clientId),
    ),
  );
  data.proposals.forEach((p) =>
    add(
      p.id,
      `${p.number} · ${p.title}`,
      `/proposals/${p.id}`,
      "Propuestas",
      p.introduction,
      events.has(p.eventId),
    ),
  );
  data.creativeAssets.forEach((a) =>
    add(
      a.id,
      a.title,
      `/creative?event=${a.eventId}&asset=${a.id}`,
      "Imágenes",
      a.brief,
      events.has(a.eventId),
    ),
  );
  data.venues.forEach((v) =>
    add(
      v.id,
      v.name,
      `/venues?venue=${v.id}`,
      "Lugares",
      `${v.city} ${v.notes}`,
    ),
  );
  data.equipment.forEach((e) =>
    add(
      e.id,
      e.name,
      `/inventory?equipment=${e.id}`,
      "Equipos",
      `${e.sku} ${e.description}`,
    ),
  );
  return rows.sort(
    (a, b) => b.score - a.score || a.title.localeCompare(b.title),
  );
}
