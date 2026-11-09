import { Plus, Trash2 } from "lucide-react";
import type { DesignSummary } from "../../shared/kit-design";

const day = (iso: string) => {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  if (days < 7) return "Esta semana";
  return date.toLocaleDateString("es", { month: "short", year: "numeric" });
};

/** An event's designs ("chats"), newest first, with New design and delete. */
export function DesignHistory({
  designs,
  activeId,
  canEdit,
  busy,
  onNew,
  onOpen,
  onDelete,
}: {
  designs: DesignSummary[];
  activeId: string | null;
  canEdit: boolean;
  busy: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (design: DesignSummary) => void;
}) {
  const groups: [string, DesignSummary[]][] = [];
  for (const design of designs) {
    const group = day(design.updatedAt);
    const last = groups[groups.length - 1];
    if (last?.[0] === group) last[1].push(design);
    else groups.push([group, [design]]);
  }
  return (
    <aside className="kd-history" aria-label="Historial de diseños">
      <button
        type="button"
        className="button secondary kd-new"
        disabled={!canEdit || busy}
        onClick={onNew}
      >
        <Plus size={16} aria-hidden="true" />
        Nuevo diseño
      </button>
      <nav className="kd-history-list" aria-label="Diseños de este evento">
        {groups.map(([group, items]) => (
          <section key={group}>
            <h2>{group}</h2>
            {items.map((design) => (
              <div className="kd-history-row" key={design.id}>
                <button
                  type="button"
                  className={design.id === activeId ? "selected" : ""}
                  aria-current={design.id === activeId ? "true" : undefined}
                  title={design.title}
                  onClick={() => onOpen(design.id)}
                >
                  {design.title}
                  {design.working ? " · trabajando" : ""}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="kd-history-delete"
                    aria-label={`Eliminar diseño ${design.title}`}
                    title="Eliminar diseño"
                    disabled={busy || design.working}
                    onClick={() => onDelete(design)}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </section>
        ))}
        {!designs.length && (
          <p className="muted kd-history-empty">Aún no hay diseños.</p>
        )}
      </nav>
    </aside>
  );
}
