import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CalendarPlus, Check, Download, Undo2, X } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { canEditCollection } from "../../shared/access";
import { Badge, Button, Empty, PageHeader } from "../../shared/ui";
import { MIN_BRIEF_LENGTH, type DesignVersion } from "../../shared/kit-design";
import { BeforeAfter } from "./BeforeAfter";
import { DesignChat } from "./DesignChat";
import { DropZone } from "./DropZone";
import { canvasPainter, fixtureEngine, type DesignEngine } from "./engine";
import { MAX_ROOM_IMAGES, prepareRoomImage } from "./prepare-image";
import {
  addImages,
  addMessage,
  applyPending,
  commitFirstVersion,
  currentVersion,
  discardPending,
  nextVersionNumber,
  proposeVersion,
  removeImage,
  selectVersion,
  useDesignProject,
} from "./project";

/** Phase 1: sample renders made in the browser. Phase 2 swaps in the server engine. */
const engine: DesignEngine = fixtureEngine(canvasPainter);

export function Design() {
  const { data, user, toast } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const event =
    data.events.find((e) => e.id === params.get("event")) || data.events[0];
  if (!event)
    return (
      <>
        <PageHeader title="Diseño" />
        <Empty
          icon={<CalendarPlus size={26} />}
          title="Primero crea un evento"
          description="Cada diseño pertenece a un evento. Crea el evento y vuelve aquí para soltar las fotos del salón."
          action={
            <Button onClick={() => navigate("/events?new=1")}>
              <CalendarPlus size={16} />
              Crear evento
            </Button>
          }
        />
      </>
    );
  return (
    <>
      <PageHeader
        title="Diseño"
        actions={
          <select
            aria-label="Evento del diseño"
            value={event.id}
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
      <DesignWorkspace
        key={event.id}
        eventId={event.id}
        canEdit={canEditCollection(user, "layouts")}
        toast={toast}
      />
    </>
  );
}

function DesignWorkspace({
  eventId,
  canEdit,
  toast,
}: {
  eventId: string;
  canEdit: boolean;
  toast: (message: string) => void;
}) {
  const { data } = useWorkspace();
  const [project, change] = useDesignProject(eventId);
  const [preparing, setPreparing] = useState(false);
  const [working, setWorking] = useState("");
  const [viewIndex, setViewIndex] = useState(0);
  const current = currentVersion(project);
  const shown: DesignVersion | undefined = project.pendingVersion || current;
  const firstDesign = !project.versions.length;

  async function takeFiles(files: File[]) {
    setPreparing(true);
    try {
      const results = await Promise.allSettled(files.map(prepareRoomImage));
      const ready = results.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
      const failed = results.find((r) => r.status === "rejected");
      if (failed) toast((failed.reason as Error).message);
      let skipped = 0;
      change((p) => {
        const result = addImages(p, ready);
        skipped = result.skipped;
        return result.project;
      });
      if (skipped)
        toast(`Solo se usan ${MAX_ROOM_IMAGES} imágenes por diseño.`);
    } finally {
      setPreparing(false);
    }
  }

  async function submit(text: string) {
    change((p) => addMessage(p, "user", text));
    try {
      if (firstDesign) {
        setWorking("Leyendo el salón… diseñando el montaje… generando vistas…");
        const result = await engine.create({
          brief: text,
          images: project.images,
          equipment: data.equipment,
          versionNumber: nextVersionNumber(project),
        });
        change((p) =>
          addMessage(
            commitFirstVersion(p, text, result),
            "assistant",
            result.reply,
          ),
        );
      } else {
        if (!current) return false;
        setWorking("Preparando el cambio…");
        const result = await engine.refine({
          request: text,
          spec: current.spec,
          images: project.images,
          equipment: data.equipment,
          versionNumber: nextVersionNumber(project),
        });
        change((p) =>
          addMessage(
            proposeVersion(p, text, result),
            "assistant",
            result.reply,
          ),
        );
      }
      setViewIndex(0);
      return true;
    } catch (error) {
      const message =
        (error as Error).message || "No se pudo completar el diseño.";
      change((p) =>
        addMessage(p, "assistant", `No pude completarlo: ${message}`),
      );
      return false;
    } finally {
      setWorking("");
    }
  }

  const blockedReason = !canEdit
    ? "Tu rol puede ver los diseños, pero no crearlos."
    : !project.images.length
      ? "Primero suelta al menos una imagen del salón."
      : project.pendingVersion
        ? "Aplica o descarta el cambio pendiente antes de pedir otro."
        : undefined;

  return (
    <div className="kd-layout">
      <section className="kd-stage" aria-label="Imágenes del diseño">
        {!project.images.length ? (
          <DropZone
            onFiles={(f) => void takeFiles(f)}
            busy={preparing}
            disabled={!canEdit}
          />
        ) : !shown ? (
          <RoomImages
            project={project}
            canEdit={canEdit && !working}
            preparing={preparing}
            onFiles={(f) => void takeFiles(f)}
            onRemove={(imageId) => change((p) => removeImage(p, imageId))}
          />
        ) : (
          <Result
            version={shown}
            pending={!!project.pendingVersion}
            images={project.images}
            viewIndex={Math.min(viewIndex, shown.renders.length - 1)}
            onView={setViewIndex}
            onApply={() => {
              change(applyPending);
              toast("Cambio aplicado.");
            }}
            onDiscard={() => change(discardPending)}
          />
        )}
        {project.versions.length > 0 && (
          <nav className="kd-versions" aria-label="Versiones">
            {project.versions.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`kd-version ${v.id === project.currentVersionId ? "active" : ""}`}
                aria-pressed={v.id === project.currentVersionId}
                disabled={!!project.pendingVersion || !!working}
                title={v.request}
                onClick={() => change((p) => selectVersion(p, v.id))}
              >
                Versión {v.number}
              </button>
            ))}
          </nav>
        )}
      </section>
      <DesignChat
        messages={project.messages}
        greeting={
          firstDesign
            ? "Hola, soy KIT Design. Suelta las fotos o el plano del salón y cuéntame qué evento es: tipo, invitados, estilo y lo que no puede faltar."
            : "Dime qué quieres cambiar y preparo una nueva versión para que la revises."
        }
        placeholder={
          firstDesign
            ? "Ej.: Boda para 120, escenario al fondo, pantalla LED y tonos dorados"
            : "Ej.: Más luz cálida y quita las mesas de la derecha"
        }
        submitLabel={firstDesign ? "Crear diseño" : "Enviar"}
        firstDesign={firstDesign}
        blockedReason={blockedReason}
        working={working}
        onSubmit={async (text) => {
          if (firstDesign && text.length < MIN_BRIEF_LENGTH) {
            toast("Describe el evento con un poco más de detalle.");
            return false;
          }
          return submit(text);
        }}
      />
    </div>
  );
}

function RoomImages({
  project,
  canEdit,
  preparing,
  onFiles,
  onRemove,
}: {
  project: ReturnType<typeof useDesignProject>[0];
  canEdit: boolean;
  preparing: boolean;
  onFiles: (files: File[]) => void;
  onRemove: (imageId: string) => void;
}) {
  return (
    <div className="kd-images">
      <ul className="kd-image-grid">
        {project.images.map((image) => (
          <li key={image.id}>
            <img src={image.dataUrl} alt={image.name} />
            {canEdit && (
              <button
                type="button"
                className="icon-button kd-image-remove"
                aria-label={`Quitar ${image.name}`}
                onClick={() => onRemove(image.id)}
              >
                <X size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
      {project.images.length < MAX_ROOM_IMAGES && (
        <DropZone
          compact
          onFiles={onFiles}
          busy={preparing}
          disabled={!canEdit}
          remaining={MAX_ROOM_IMAGES - project.images.length}
        />
      )}
      <p className="muted">
        Las fotos del salón dan mejores resultados que un plano. Ahora cuéntale
        a KIT Design qué evento es.
      </p>
    </div>
  );
}

function Result({
  version,
  pending,
  images,
  viewIndex,
  onView,
  onApply,
  onDiscard,
}: {
  version: DesignVersion;
  pending: boolean;
  images: { id: string; name: string; dataUrl: string }[];
  viewIndex: number;
  onView: (index: number) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const { data } = useWorkspace();
  const render = version.renders[viewIndex];
  const source = images.find((i) => i.id === render?.sourceImageId);
  return (
    <div className="kd-result">
      {pending && (
        <div className="kd-pending" role="status">
          <span>
            <strong>Cambio pendiente · Versión {version.number}:</strong>{" "}
            {version.request}
          </span>
          <div className="kd-pending-actions">
            <Button variant="secondary" onClick={onDiscard}>
              <Undo2 size={16} />
              Descartar
            </Button>
            <Button onClick={onApply}>
              <Check size={16} />
              Aplicar
            </Button>
          </div>
        </div>
      )}
      {render && source && (
        <BeforeAfter
          key={render.dataUrl}
          before={source.dataUrl}
          after={render.dataUrl}
          label={`Vista ${viewIndex + 1}`}
        />
      )}
      <div className="kd-result-bar">
        {version.renders.length > 1 && (
          <div className="kd-views" role="group" aria-label="Vistas">
            {version.renders.map((r, index) => (
              <button
                key={r.viewId}
                type="button"
                className={`kd-view ${index === viewIndex ? "active" : ""}`}
                aria-pressed={index === viewIndex}
                aria-label={`Vista ${index + 1}`}
                onClick={() => onView(index)}
              >
                <img src={r.dataUrl} alt="" />
              </button>
            ))}
          </div>
        )}
        {render && (
          <a
            className="button ghost"
            href={render.dataUrl}
            download={`diseno-v${version.number}-vista-${viewIndex + 1}.jpg`}
          >
            <Download size={16} />
            Descargar
          </a>
        )}
      </div>
      <details className="kd-equipment" open>
        <summary>
          Equipo en el diseño · {version.spec.items.length} artículos
        </summary>
        <ul>
          {version.spec.items.map((item, index) => {
            const known = data.equipment.find((e) => e.id === item.equipmentId);
            return (
              <li key={`${item.equipmentId || item.label}-${index}`}>
                <span className="kd-qty">{item.quantity}×</span>
                <span>
                  {known ? (
                    <Link to="/inventory">{known.name}</Link>
                  ) : (
                    item.label
                  )}
                  <small className="muted"> · {item.placement}</small>
                </span>
                {!known && <Badge tone="neutral">No está en el catálogo</Badge>}
              </li>
            );
          })}
        </ul>
        {version.spec.room.measured === "estimated" && (
          <p className="muted">{version.spec.room.notes}</p>
        )}
      </details>
    </div>
  );
}
