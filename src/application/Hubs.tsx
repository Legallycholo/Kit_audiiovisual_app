import { Link, NavLink, useLocation } from "react-router-dom";
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
      <Link className="button" to="/library/files">
        Archivos del equipo y permisos
      </Link>
      <Link className="button" to="/search">
        Búsqueda universal
      </Link>
    </section>
  );
}
