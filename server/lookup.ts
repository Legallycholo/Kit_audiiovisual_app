import { HttpError } from "./database";

/** One web suggestion. Never written to a record without a person choosing it. */
export interface LookupSuggestion {
  title: string;
  subtitle?: string;
  address?: string;
  phone?: string;
  website?: string;
  date?: string;
  /** Shown for reference only; catalog rates are never set from it. */
  referencePrice?: number;
  link?: string;
}

export type LookupKind = "equipment" | "venue" | "event";

const text = (value: unknown, max = 300) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, max)
    : undefined;
const https = (value: unknown) => {
  const url = text(value, 2000);
  try {
    return url && new URL(url).protocol === "https:" ? url : undefined;
  } catch {
    return undefined;
  }
};

const engines: Record<LookupKind, string> = {
  equipment: "google_shopping",
  venue: "google_maps",
  event: "google_events",
};

/** Calls SerpApi and maps the response to plain suggestions. */
export async function serpLookup(
  kind: LookupKind,
  query: string,
  key: string,
  transport: typeof fetch = fetch,
): Promise<LookupSuggestion[]> {
  const params = new URLSearchParams({
    engine: engines[kind],
    q: kind === "event" ? `${query} Puerto Rico` : query,
    hl: "es",
    gl: "us",
    api_key: key,
  });
  if (kind === "venue") params.set("type", "search");
  let response: Response;
  try {
    response = await transport(`https://serpapi.com/search.json?${params}`, {
      method: "GET",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new HttpError(503, "No se pudo contactar la búsqueda externa.");
  }
  if (response.status === 401 || response.status === 403)
    throw new HttpError(
      502,
      "La búsqueda externa rechazó la clave configurada.",
    );
  if (response.status === 429)
    throw new HttpError(
      429,
      "La búsqueda externa alcanzó su límite. Intenta más tarde.",
    );
  if (!response.ok)
    throw new HttpError(502, "La búsqueda externa no respondió correctamente.");
  let value: any;
  try {
    value = await response.json();
  } catch {
    throw new HttpError(502, "La búsqueda externa devolvió datos inválidos.");
  }
  const rows: unknown[] =
    kind === "equipment"
      ? value.shopping_results
      : kind === "venue"
        ? value.local_results
        : value.events_results;
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, 6).flatMap((row: any): LookupSuggestion[] => {
    const title = text(row?.title, 200);
    if (!title) return [];
    if (kind === "equipment")
      return [
        {
          title,
          subtitle: text(row.source, 120),
          referencePrice:
            typeof row.extracted_price === "number" &&
            Number.isFinite(row.extracted_price) &&
            row.extracted_price >= 0
              ? row.extracted_price
              : undefined,
          link: https(row.product_link) ?? https(row.link),
        },
      ];
    if (kind === "venue")
      return [
        {
          title,
          subtitle: text(row.type, 120),
          address: text(row.address),
          phone: text(row.phone, 60),
          website: https(row.website),
        },
      ];
    return [
      {
        title,
        date: text(row.date?.when, 120),
        address: Array.isArray(row.address)
          ? text(
              row.address
                .filter((p: unknown) => typeof p === "string")
                .join(", "),
            )
          : undefined,
        link: https(row.link),
      },
    ];
  });
}
