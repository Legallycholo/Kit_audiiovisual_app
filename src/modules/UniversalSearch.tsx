import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../shared/store";
import { searchWorkspace, type SearchResult } from "../shared/search";
import {
  files,
  nativeFiles,
  type IndexedFile,
  type FileStatus,
} from "../shared/file-search";
export function SearchPage() {
  const { data, user, mode, request } = useWorkspace();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const sourceId = params.get("source") || "";
  const [query, setQuery] = useState(q);
  const navigate = useNavigate();
  const [remote, setRemote] = useState<SearchResult[]>([]);
  const [companyConnected, setCompanyConnected] = useState(false);
  const [coverage, setCoverage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [grouped, setGrouped] = useState(true);
  const [filter, setFilter] = useState("Todos");
  const key = `kit:saved-searches:${mode}:${user?.id || "local"}`;
  const [saved, setSaved] = useState<string[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(value)
        ? value.filter((v): v is string => typeof v === "string").slice(0, 30)
        : [];
    } catch {
      return [];
    }
  });
  function save(values: string[]) {
    try {
      localStorage.setItem(key, JSON.stringify(values));
      setSaved(values);
    } catch {
      setError("No se pudo guardar la búsqueda en este dispositivo.");
    }
  }
  useEffect(() => {
    let active = true;
    setRemote([]);
    setError("");
    if (!q && !(mode === "company" && sourceId)) return;
    setBusy(true);
    void (async () => {
      if (mode === "company" && sourceId) {
        const source = await request<{
          id: string;
          title: string;
          mime: string;
          excerpt: string;
          reason: string;
        }>(`/search/sources/${encodeURIComponent(sourceId)}`);
        if (active) {
          setRemote([
            {
              ...source,
              path: `/search?source=${encodeURIComponent(source.id)}`,
              type: source.mime.startsWith("image/") ? "Imágenes" : "Archivos",
              source: "cloud",
              score: 100,
            },
          ]);
          setCoverage("Fuente indexada aprobada para esta cuenta.");
        }
        if (!q) return;
      }
      if (nativeFiles()) {
        const status = await files<FileStatus>("file_status");
        const found = await files<IndexedFile[]>("file_search", { query: q });
        if (active) {
          setCoverage(
            `${status.indexed} archivos indexados. ${status.running ? "Indexación en curso; resultados parciales." : status.policy.granted ? `Índice local. OCR de imágenes ${status.policy.ocr ? "activado" : "desactivado"}.` : "Acceso local no autorizado."} Máximo 100 coincidencias y 50 MB de verificación por consulta; usa términos más específicos para ampliar cobertura.`,
          );
          setRemote(
            found.map((f) => ({
              id: f.id,
              title: f.title,
              path: `/files/${f.id}`,
              type: f.mime.startsWith("image/") ? "Imágenes" : "Archivos",
              source: "local",
              excerpt: f.excerpt || f.relativePath,
              reason: f.reason,
              score: 60 + Math.min(f.score, 20),
            })),
          );
        }
        const company = await files<{
          connected: boolean;
          results: SearchResult[];
        }>("cloud_search", { action: "records", query: q });
        if (active) {
          setCompanyConnected(company.connected);
          setRemote((previous) => [...previous, ...company.results]);
          if (company.connected)
            setCoverage(
              (previous) => `${previous} Registros de empresa conectados.`,
            );
        }
        if (status.policy.cloudConsent) {
          const cloud = await files<{
            results: Array<{
              id: string;
              title: string;
              mime: string;
              excerpt: string;
              score: number;
              reason: string;
            }>;
          }>("cloud_search", { action: "query", query: q });
          if (active)
            setRemote((previous) => [
              ...previous,
              ...cloud.results
                .filter((f) => !found.some((local) => local.id === f.id))
                .map((f) => ({
                  ...f,
                  path: `/search?q=${encodeURIComponent(q)}&source=${f.id}`,
                  type: f.mime.startsWith("image/") ? "Imágenes" : "Archivos",
                  source: "cloud" as const,
                  score: 50 + Math.min(20, Math.max(0, f.score) * 20),
                })),
            ]);
        }
      } else if (mode === "company") {
        const result = await request<{
          configured: boolean;
          results: Array<{
            id: string;
            title: string;
            mime: string;
            excerpt: string;
            score: number;
            reason: string;
          }>;
        }>("/search/query", { method: "POST", body: { query: q } });
        if (active) {
          setCoverage(
            result.configured
              ? "Índice semántico personal de empresa. No incluye archivos sin sincronizar."
              : "Nube desactivada. Se muestran registros del espacio.",
          );
          setRemote((previous) => [
            ...previous.filter((item) => item.id === sourceId),
            ...result.results
              .filter((item) => item.id !== sourceId)
              .map((f) => ({
                ...f,
                path: `/search?q=${encodeURIComponent(q)}&source=${f.id}`,
                type: f.mime.startsWith("image/") ? "Imágenes" : "Archivos",
                source: "cloud" as const,
                score: 50 + Math.min(20, Math.max(0, f.score) * 20),
              })),
          ]);
        }
      } else if (active)
        setCoverage(
          "Registros del espacio. Abre KIT Desktop para buscar archivos de tu equipo.",
        );
    })()
      .catch((e) => {
        if (active) setError(String(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [q, sourceId, mode, request]);
  const all = [
    ...(companyConnected ? [] : searchWorkspace(data, user, q)),
    ...remote,
  ].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  const types = [...new Set(all.map((r) => r.type))];
  const results = all.filter((r) => filter === "Todos" || r.type === filter);
  const groups = grouped
    ? [...new Set(results.map((r) => r.type))]
    : ["Resultados"];
  const selected = remote.find((r) => r.id === params.get("source"));
  return (
    <section>
      <h1>{q ? `Búsqueda: ${q}` : "Buscar en KIT"}</h1>
      <form
        className="workspace-search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate(`/search?q=${encodeURIComponent(query.trim())}`);
        }}
      >
        <input
          aria-label="Buscar registros"
          value={query}
          maxLength={300}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="button primary">Buscar</button>
      </form>
      <div className="file-actions">
        <Link to="/library/files">Permisos y archivos locales</Link>
        <button
          className="button"
          disabled={!q || saved.includes(q) || saved.length >= 30}
          onClick={() => save([...saved, q])}
        >
          Guardar búsqueda
        </button>
        <label>
          <input
            type="checkbox"
            checked={grouped}
            onChange={(e) => setGrouped(e.target.checked)}
          />{" "}
          Agrupar por tipo
        </label>
        <label>
          Tipo{" "}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            {["Todos", ...types].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      </div>
      {saved.length > 0 && (
        <details>
          <summary>Búsquedas guardadas ({saved.length})</summary>
          <ul>
            {saved.map((s) => (
              <li key={s}>
                <Link to={`/search?q=${encodeURIComponent(s)}`}>{s}</Link>{" "}
                <button
                  className="button"
                  aria-label={`Eliminar búsqueda ${s}`}
                  onClick={() => save(saved.filter((v) => v !== s))}
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p role="status">
        {busy ? "Buscando…" : coverage}{" "}
        {q && !busy && `${results.length} resultados.`}
      </p>
      {error && (
        <p role="alert">No se completaron todas las fuentes: {error}</p>
      )}
      {selected && (
        <article className="panel">
          <h2>{selected.title}</h2>
          <p>{selected.excerpt}</p>
          <p className="muted">
            Extracto de nube. El original solo se abre desde el equipo
            autorizado.
          </p>
          {selected.source === "cloud" && mode === "company" && (
            <Link
              className="button primary"
              to={`/kit?source=${encodeURIComponent(selected.id)}&sourceTitle=${encodeURIComponent(selected.title)}`}
            >
              Preguntar a KIT sobre esta fuente
            </Link>
          )}
        </article>
      )}
      {groups.map((group) => (
        <div key={group}>
          {grouped && <h2>{group}</h2>}
          <div className="search-results">
            {results
              .filter((r) => !grouped || r.type === group)
              .map((r) => (
                <button
                  key={`${r.source}:${r.type}:${r.id}`}
                  onClick={() => {
                    if (r.source === "company") {
                      void files("open_company_window", {
                        route: r.path,
                      }).catch((e) => setError(String(e)));
                    } else {
                      window.dispatchEvent(new Event("kit:preview"));
                      navigate(r.path);
                    }
                  }}
                >
                  <span>
                    {r.title}
                    <small>
                      {r.type} ·{" "}
                      {r.source === "company"
                        ? "Empresa"
                        : r.source === "app"
                          ? "KIT"
                          : r.source === "local"
                            ? "Este equipo"
                            : "Nube personal"}{" "}
                      · {r.reason}
                    </small>
                    <small>{r.excerpt}</small>
                  </span>
                </button>
              ))}
          </div>
        </div>
      ))}
      {q && !busy && !results.length && (
        <p>
          No hay coincidencias. Prueba otro nombre o revisa la cobertura y las
          exclusiones.
        </p>
      )}
    </section>
  );
}
