import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, Plus } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { Button, Empty, PageHeader } from "../../shared/ui";
import { id } from "../../shared/domain";
import { uiLabel } from "../../shared/i18n";
import type { Layout, LayoutReference } from "../../shared/types";
import { LayoutEditor } from "./LayoutEditor";
import { PlanDropZone } from "./PlanDropZone";
import { prepareFloorPlanImage } from "./floor-plan-image";

export function Design() {
  const { data, update, toast } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const eventId = params.get("event") || data.events[0]?.id;
  const selectedEvent = data.events.find((e) => e.id === eventId);
  const existing = data.layouts.find((l) => l.eventId === eventId);
  const [view, setView] = useState("2D");
  const [templateId, setTemplateId] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  async function createFromPlan(file: File) {
    setPreparing(true);
    try {
      await createLayout(undefined, await prepareFloorPlanImage(file));
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setPreparing(false);
    }
  }
  async function createLayout(template?: Layout, reference?: LayoutReference) {
    // Every layout belongs to an event; never send one without it.
    const event = selectedEvent;
    if (!event) {
      toast("Selecciona un evento antes de crear el plano.");
      return;
    }
    const room = data.venues.find((v) => v.id === event.venueId)?.rooms[0];
    const width = room?.width || template?.width || 24;
    // A dropped plan sets the proportions so it is not stretched: keep the
    // room's width and follow the image for the depth until it is calibrated.
    const depth = reference
      ? Math.round(
          ((width * reference.intrinsicHeight) / reference.intrinsicWidth) * 10,
        ) / 10
      : room?.depth || template?.depth || 26;
    const templateScale = template
      ? Math.min(width / template.width, depth / template.depth)
      : 1;
    const next: Layout = {
      id: id(),
      eventId: event.id,
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
      ...(reference ? { reference } : {}),
    };
    if (!(await update((s) => ({ ...s, layouts: [...s.layouts, next] }))))
      return;
    toast(
      reference
        ? "Plano cargado. Calibra la escala con una medida conocida antes de producción."
        : template
          ? "Plantilla copiada y ajustada al salón. Confirma todas las medidas."
          : "Event layout created. Confirm room dimensions before production.",
    );
  }
  return (
    <>
      <PageHeader
        title="Design Studio"
        actions={
          <select
            aria-label="Design event"
            value={selectedEvent?.id || ""}
            disabled={data.events.length === 0}
            onChange={(e) => setParams({ event: e.target.value })}
          >
            {data.events.length === 0 && <option value="">Sin eventos</option>}
            {!selectedEvent && data.events.length > 0 && (
              <option value="">Selecciona un evento</option>
            )}
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        }
      />
      {data.events.length === 0 ? (
        <Empty
          icon={<CalendarPlus size={26} />}
          title="Primero crea un evento"
          description="El plano 2D se guarda dentro del evento. Crea el evento y vuelve aquí para soltar el plano."
          action={
            <Button onClick={() => navigate("/events?new=1")}>
              <CalendarPlus size={16} />
              Crear evento
            </Button>
          }
        />
      ) : existing ? (
        <LayoutEditor
          key={existing.id}
          original={existing}
          view={view}
          setView={setView}
        />
      ) : (
        <PlanDropZone
          title={uiLabel("Start with a space")}
          description="Suelta aquí el plano 2D del evento o elige una imagen (PNG, JPEG o WebP). Las fotos grandes se reducen automáticamente."
          rightsConfirmed={rightsConfirmed}
          onRightsChange={setRightsConfirmed}
          busy={preparing}
          onFile={(file) => void createFromPlan(file)}
        >
          <div className="empty-actions plan-drop-alternatives">
            <Button variant="ghost" onClick={() => void createLayout()}>
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
        </PlanDropZone>
      )}
    </>
  );
}
