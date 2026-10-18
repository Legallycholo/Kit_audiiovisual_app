import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, Globe, Search } from "lucide-react";
import { useWorkspace } from "../shared/store";
import { money } from "../shared/domain";
import { Badge, Button } from "../shared/ui";

export interface LookupSuggestion {
  title: string;
  subtitle?: string;
  address?: string;
  phone?: string;
  website?: string;
  date?: string;
  referencePrice?: number;
  link?: string;
}

const placeholders = {
  equipment: "Modelo o marca, p. ej. Shure SM58",
  venue: "Nombre del lugar y ciudad",
  event: "Nombre del evento",
} as const;

/**
 * "Buscar en la web" inside the new equipment, venue and event forms. Owner
 * only. Results are suggestions: the person decides what to copy, and
 * reference prices never change catalog rates.
 */
export function WebLookup({
  kind,
  onUse,
}: {
  kind: "equipment" | "venue" | "event";
  onUse: (suggestion: LookupSuggestion) => void;
}) {
  const { mode, user, request } = useWorkspace();
  const [status, setStatus] = useState<{
    configured: boolean;
    used: number;
    cap: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<LookupSuggestion[] | null>(null);
  const [error, setError] = useState("");
  const owner = mode === "company" && Boolean(user?.isOwner);
  useEffect(() => {
    if (!owner) return;
    request<{ configured: boolean; used: number; cap: number }>(
      "/lookup/status",
    )
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [owner, request]);
  if (!owner || !status) return null;
  if (!status.configured)
    return (
      <p className="web-lookup-note">
        <Globe size={15} aria-hidden="true" />
        Búsqueda externa no conectada.{" "}
        <Link to="/settings/integrations">Conectar en Integraciones</Link>
      </p>
    );
  const capped = status.used >= status.cap;
  const search = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await request<{
        results: LookupSuggestion[];
        used: number;
        cap: number;
      }>("/lookup", { method: "POST", body: { kind, query } });
      setResults(result.results);
      setStatus({ configured: true, used: result.used, cap: result.cap });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="web-lookup" aria-label="Búsqueda externa">
      <div className="web-lookup-bar">
        <label className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            aria-label="Buscar en la web"
            placeholder={placeholders[kind]}
            value={query}
            maxLength={200}
            disabled={capped}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (query.trim().length >= 2 && !busy) void search();
              }
            }}
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || capped || query.trim().length < 2}
          onClick={() => void search()}
        >
          <Globe size={15} />
          {busy ? "Buscando…" : "Buscar en la web"}
        </Button>
      </div>
      <small className="web-lookup-usage">
        {capped
          ? "Límite mensual alcanzado."
          : `${status.used} de ${status.cap} búsquedas usadas este mes.`}
      </small>
      {error && (
        <p className="web-lookup-error" role="alert">
          {error}
        </p>
      )}
      {results && results.length === 0 && (
        <p className="web-lookup-note">Sin resultados para esta búsqueda.</p>
      )}
      {results && results.length > 0 && (
        <ul className="web-lookup-results">
          {results.map((item, index) => (
            <li key={`${item.title}-${index}`}>
              <div>
                <Badge tone="blue">Sugerencia</Badge>
                <strong>{item.title}</strong>
                <small>
                  {[item.subtitle, item.date, item.address, item.phone]
                    .filter(Boolean)
                    .join(" · ")}
                </small>
                {item.referencePrice !== undefined && (
                  <small>
                    Precio de referencia {money(item.referencePrice)} · no
                    cambia la tarifa del catálogo
                  </small>
                )}
              </div>
              <span className="web-lookup-actions">
                {(item.link || item.website) && (
                  <a
                    className="icon-button"
                    href={item.link || item.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Abrir fuente de ${item.title}`}
                  >
                    <ExternalLink size={15} aria-hidden="true" />
                  </a>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    onUse(item);
                    setResults(null);
                  }}
                >
                  Usar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
