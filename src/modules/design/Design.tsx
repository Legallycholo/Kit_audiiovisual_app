import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { Button, PageHeader } from "../../shared/ui";
import { id } from "../../shared/domain";
import { uiLabel } from "../../shared/i18n";
import type { Layout, LayoutReference } from "../../shared/types";
import { LayoutEditor } from "./LayoutEditor";
import { PlanDropZone } from "./PlanDropZone";
import { prepareFloorPlanImage } from "./floor-plan-image";

export function Design() {
  const { data, update, toast } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const eventId = params.get("event") || data.events[0]?.id;
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
    const event = data.events.find((e) => e.id === eventId);
    const room = data.venues.find((v) => v.id === event?.venueId)?.rooms[0];
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
