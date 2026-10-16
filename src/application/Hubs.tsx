import {
  Link,
  NavLink,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useState } from "react";
import { useWorkspace } from "../shared/store";
import { canSeeModule } from "../shared/access";
export const hubs = [
  {
    title: "Inicio",
    to: "/",
    pages: [
      ["/", "Resumen"],
      ["/reports", "Informes"],
    ],
  },
  {
    title: "Proyectos",
    to: "/events",
    pages: [
      ["/events", "Eventos"],
      ["/proposals", "Propuestas"],
      ["/inbox", "Mensajes"],
      ["/production", "Producción"],
    ],
  },
  {
    title: "Diseño",
    to: "/design",
    pages: [
      ["/design", "Planos y 3D"],
      ["/creative", "Estudio creativo"],
    ],
  },
  {
    title: "Biblioteca",
    to: "/library",
    pages: [
      ["/library", "Biblioteca"],
      ["/clients", "Clientes"],
      ["/venues", "Lugares"],
      ["/inventory", "Equipos"],
    ],
  },
  { title: "KIT", to: "/kit", pages: [["/kit", "KIT"]] },
];
export function activeHub(path: string) {
  return hubs.find((h) =>
    h.pages.some(([p]) =>
      p === "/" ? path === "/" : path === p || path.startsWith(p + "/"),
    ),
  );
}
export function HubNavigation() {
  const { user } = useWorkspace();
  const { pathname } = useLocation();
  const hub = activeHub(pathname);
  return (
    hub && (
      <nav className="hub-navigation" aria-label="Secciones del área">
        {hub.pages
          .filter(([p]) => canSeeModule(user, p))
          .map(([p, l]) => (
            <NavLink key={p} to={p} end={p === "/"}>
              {l}
            </NavLink>
          ))}
      </nav>
    )
  );
}
export function LibraryHub() {
  const { user } = useWorkspace();
  return (
    <section>
      <h1>Biblioteca</h1>
      <p className="muted">Personas, lugares y equipos para tus proyectos.</p>
      <div className="hub-cards">
        {hubs[3].pages
          .slice(1)
          .filter(([p]) => canSeeModule(user, p))
          .map(([p, l]) => (
            <Link className="panel" key={p} to={p}>
              <h2>{l}</h2>
              <p>Abrir colección →</p>
            </Link>
          ))}
      </div>
      <p className="muted">
        La búsqueda de archivos del equipo estará disponible en una fase
        posterior.
      </p>
    </section>
  );
}
export function KitHub() {
  return (
    <section className="kit-landing">
      <span className="kit-mark">KIT</span>
      <h1>Tu espacio con KIT</h1>
      <p>
        La conversación completa y el historial compartido con la barra lateral
        llegarán en la fase 5.
      </p>
      <Link className="button primary" to="/proposals">
        Redactar una propuesta con IA
      </Link>
      <p className="muted">
        Disponible con una conexión de empresa configurada.
      </p>
    </section>
  );
}
export function SearchPage() {
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const navigate = useNavigate();
  const { data, user } = useWorkspace();
  const entries = [
    ...data.events.map((e) => ({
      title: e.name,
      path: `/events/${e.id}`,
      type: "Proyecto",
    })),
    ...data.clients.map((c) => ({
      title: c.name,
      path: `/clients?client=${c.id}`,
      type: "Cliente",
    })),
    ...data.proposals.map((p) => ({
      title: `${p.number} · ${p.title}`,
      path: `/proposals/${p.id}`,
      type: "Propuesta",
    })),
  ];
  const q = params.get("q") || "";
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
          onChange={(e) => setQuery(e.target.value)}
        />
        <button className="button primary">Buscar</button>
      </form>
      <p className="muted">
        Proyectos, clientes y propuestas de este espacio. La búsqueda de
        archivos locales llegará en la fase 3.
      </p>
      <div className="search-results">
        {q &&
          entries
            .filter(
              (r) =>
                canSeeModule(user, r.path) &&
                r.title.toLowerCase().includes(q.toLowerCase()),
            )
            .map((r) => (
              <button
                key={r.path}
                onClick={() => {
                  window.dispatchEvent(new Event("kit:preview"));
                  navigate(r.path);
                }}
              >
                <span>
                  {r.title}
                  <small>{r.type}</small>
                </span>
              </button>
            ))}
      </div>
    </section>
  );
}
