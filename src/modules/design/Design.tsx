import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { Button, Empty, PageHeader } from "../../shared/ui";
import { id } from "../../shared/domain";
import type { Layout } from "../../shared/types";
import { LayoutEditor } from "./LayoutEditor";

export function Design() {
  const { data, update, toast } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const eventId = params.get("event") || data.events[0]?.id;
  const existing = data.layouts.find((l) => l.eventId === eventId);
  const [view, setView] = useState("2D");
  const [templateId, setTemplateId] = useState("");
  async function createLayout(template?: Layout) {
    const event = data.events.find((e) => e.id === eventId);
    const room = data.venues.find((v) => v.id === event?.venueId)?.rooms[0];
    const width = room?.width || template?.width || 24;
    const depth = room?.depth || template?.depth || 26;
    const templateScale = template
      ? Math.min(width / template.width, depth / template.depth)
      : 1;
    const next: Layout = {
      id: id(),
      eventId: eventId!,
      name: `${room?.name || "Event space"} · Main layout`,
      version: 1,
      width,
      depth,
      verified: false,
      objects: (template?.objects || []).map((object) => ({
        ...structuredClone(object),
        id: id(),
        x: Math.round(object.x * templateScale * 10) / 10,
        y: Math.round(object.y * templateScale * 10) / 10,
        width: Math.round(object.width * templateScale * 10) / 10,
        depth: Math.round(object.depth * templateScale * 10) / 10,
      })),
      history: [],
    };
    if (!(await update((s) => ({ ...s, layouts: [...s.layouts, next] }))))
      return;
    toast(
      template
        ? "Plantilla copiada y ajustada al salón. Confirma todas las medidas."
        : "Event layout created. Confirm room dimensions before production.",
    );
  }
  return (
    <>
      <PageHeader
        eyebrow="GIVE YOUR VISION SOME SPACE"
        title="Design Studio"
        description="One layout. Two perspectives. Every object connected."
        actions={
          <select
            aria-label="Design event"
            value={eventId || ""}
            onChange={(e) => setParams({ event: e.target.value })}
          >
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        }
      />
      {existing ? (
        <LayoutEditor
          key={existing.id}
          original={existing}
          view={view}
          setView={setView}
        />
      ) : (
        <Empty
          title="Start with a space"
          description="Create a layout linked to this event's venue. You can add and position objects, then inspect them in 3D."
          action={
            <div className="empty-actions">
              <Button onClick={() => void createLayout()}>
                <Plus size={16} />
                Create event layout
              </Button>
              {data.layouts.length > 0 && (
                <>
                  <label>
                    <span>Usar plano guardado como plantilla</span>
                    <select
                      aria-label="Plano para usar como plantilla"
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                    >
                      <option value="">Selecciona un plano</option>
                      {data.layouts.map((layout) => (
                        <option key={layout.id} value={layout.id}>
                          {layout.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="secondary"
                    disabled={!templateId}
                    onClick={() =>
                      void createLayout(
                        data.layouts.find((layout) => layout.id === templateId),
                      )
                    }
                  >
                    Copiar plantilla
                  </Button>
                </>
              )}
            </div>
          }
        />
      )}
    </>
  );
}
