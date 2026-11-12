import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  Check,
  Download,
  FilePlus2,
  Printer,
  Undo2,
  Video,
  X,
} from "lucide-react";
import { activity, useWorkspace } from "../../shared/store";
import { canEditCollection } from "../../shared/access";
import { id } from "../../shared/domain";
import { createDesignProposalVisual } from "../../shared/proposal-visuals";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Modal,
  PageHeader,
} from "../../shared/ui";
import {
  MAX_ROOM_IMAGES,
  MIN_BRIEF_LENGTH,
  checkDesignInventory,
  designToProposal,
  isFixtureRender,
  type DesignProject,
  type DesignStatus,
  type DesignSummary,
  type DesignVersion,
} from "../../shared/kit-design";
import type { ProductionEvent } from "../../shared/types";
import { DesignChat } from "./DesignChat";
import { DesignHistory } from "./DesignHistory";
import { DropZone } from "./DropZone";
import { prepareRoomImage } from "./prepare-image";
import { uploadImages, useDesign, useDesignHistory } from "./client";

export function Design() {
  const { data } = useWorkspace();
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
      <DesignWorkspace key={event.id} event={event} />
    </>
  );
}

function workingLabel(project: DesignProject) {
  if (!project.job) return "";
  if (project.job.kind === "video")
    return "Creando el video: una vuelta de cámara sobre tu diseño en 3D. Puede tardar un par de minutos.";
  return project.job.kind === "create"
    ? "Leyendo el salón… diseñando el montaje… generando vistas. Puede tardar un par de minutos."
    : "Preparando el cambio y generando las vistas nuevas…";
}

/** The allowance line under the chat when renders or videos cost money. */
function allowanceNote(status: DesignStatus | null, project: DesignProject) {
  if (!status) return undefined;
  const liveRenders = status.renderer !== "fixture";
  const liveVideos = status.videoRenderer !== "fixture";
  if (!liveRenders && !liveVideos) return undefined;
  const views = project.versions.length
    ? (project.versions.find((v) => v.id === project.currentVersionId)?.renders
        .length ?? 0)
    : project.images.length;
  const parts = [
    liveRenders && `${status.usage.renders} de ${status.usage.cap} renders`,
    liveVideos &&
      `${status.videoUsage.videos} de ${status.videoUsage.cap} videos`,
  ].filter(Boolean);
  return `${liveRenders ? `Cada mensaje genera ${views} ${views === 1 ? "render" : "renders"}. ` : ""}Este mes: ${parts.join(" y ")}.`;
}

function DesignWorkspace({ event }: { event: ProductionEvent }) {
  const { toast, request } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const history = useDesignHistory(event.id);
  const wanted = params.get("design");
  // Open the design in the URL, else the newest one. With none yet the page is
  // empty and a design is created the moment something is dropped.
  const designId =
    history.designs.find((d) => d.id === wanted)?.id ??
    (history.loaded ? (history.designs[0]?.id ?? null) : null);
  const design = useDesign(designId);
  const { project, status } = design;
  const [preparing, setPreparing] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  const canEdit = status?.canEdit ?? false;

  // The history shows new titles and "trabajando" as the design changes.
  const stamp = `${project?.messages.length ?? 0}:${project?.job?.id ?? ""}:${project?.title ?? ""}`;
  const { refresh } = history;
  useEffect(() => {
    if (project) void refresh();
  }, [stamp, project, refresh]);

  const open = (id: string) => {
    setViewIndex(0);
    setParams({ event: event.id, design: id }, { replace: true });
  };
  async function startNew() {
    try {
      const created = await history.create();
      open(created.id);
    } catch (error) {
      toast((error as Error).message);
    }
  }
  async function removeDesign(target: DesignSummary) {
    if (
      !window.confirm(
        `¿Eliminar «${target.title}»? Se borran sus imágenes, versiones y videos.`,
      )
    )
      return;
    try {
      await history.remove(target.id);
      toast("Diseño eliminado.");
      if (target.id === designId) {
        const next = history.designs.find((d) => d.id !== target.id);
        setParams(
          next ? { event: event.id, design: next.id } : { event: event.id },
          {
            replace: true,
          },
        );
      }
    } catch (error) {
      toast((error as Error).message);
    }
  }
  async function restartDesign() {
    if (
      !window.confirm(
        "¿Reiniciar este diseño? Se borran sus versiones, videos y la conversación. Las imágenes del salón se conservan.",
      )
    )
      return;
    if (await design.restart()) {
      setViewIndex(0);
      toast("Diseño reiniciado.");
    }
  }

  const waiting = designId !== null && !project && !design.error;
  const current = project?.versions.find(
    (v) => v.id === project.currentVersionId,
  );
  const shown: DesignVersion | undefined = project?.pendingVersion || current;
  const firstDesign = !project?.versions.length;

  async function takeFiles(files: File[]) {
    const have = project?.images.length ?? 0;
    const room = MAX_ROOM_IMAGES - have;
    if (files.length > room)
      toast(`Solo se usan ${MAX_ROOM_IMAGES} imágenes por diseño.`);
    setPreparing(true);
    try {
      const results = await Promise.allSettled(
        files.slice(0, Math.max(0, room)).map(prepareRoomImage),
      );
      const failed = results.find((r) => r.status === "rejected");
      if (failed) toast((failed.reason as Error).message);
      const ready = results.flatMap((r) =>
        r.status === "fulfilled" ? [r.value] : [],
      );
      if (!ready.length) return;
      if (designId) await design.upload(ready);
      else {
        // The first drop on an event with no designs creates one.
        const created = await history.create();
        await uploadImages(request, created.id, ready);
        open(created.id);
      }
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setPreparing(false);
    }
  }

  const blockedReason = !canEdit
    ? "Tu rol puede ver los diseños, pero no crearlos."
    : !project?.images.length
      ? "Primero suelta al menos una imagen del salón."
      : project.pendingVersion
        ? "Aplica o descarta el cambio pendiente antes de pedir otro."
        : undefined;

  return (
    <div className="kd-layout">
      <DesignHistory
        designs={history.designs}
        activeId={designId}
        canEdit={canEdit}
        busy={design.busy || preparing}
        onNew={() => void startNew()}
        onOpen={open}
        onDelete={(d) => void removeDesign(d)}
      />
      <section className="kd-stage" aria-label="Imágenes del diseño">
        {design.error && (
          <ErrorNote>
            {design.error}{" "}
            <button
              type="button"
              className="text-button"
              onClick={design.clearError}
            >
              Cerrar
            </button>
          </ErrorNote>
        )}
        {waiting || !history.loaded ? (
          <p className="muted" aria-busy="true">
            Cargando diseño…
          </p>
        ) : !project?.images.length ? (
          <DropZone
            onFiles={(f) => void takeFiles(f)}
            busy={preparing || design.busy}
            disabled={!canEdit}
          />
        ) : !shown ? (
          <RoomImages
            project={project}
            canEdit={canEdit && !project.job && !design.busy}
            preparing={preparing || design.busy}
            onFiles={(f) => void takeFiles(f)}
            onRemove={(imageId) => void design.removeImage(imageId)}
          />
        ) : (
          <Result
            event={event}
            project={project}
            version={shown}
            pending={!!project.pendingVersion}
            viewIndex={Math.min(viewIndex, shown.renders.length - 1)}
            onView={setViewIndex}
            canEdit={canEdit}
            busy={design.busy}
            onApply={async () => {
              if (await design.apply()) toast("Cambio aplicado.");
            }}
            onDiscard={() => void design.discard()}
            onVideo={(renderId) => void design.createVideo(renderId)}
          />
        )}
        {project && project.versions.length > 0 && (
          <nav className="kd-versions" aria-label="Versiones">
            {project.versions.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`kd-version ${v.id === project.currentVersionId ? "active" : ""}`}
                aria-pressed={v.id === project.currentVersionId}
                disabled={
                  !canEdit ||
                  !!project.pendingVersion ||
                  !!project.job ||
                  design.busy
                }
                title={v.request}
                onClick={() => void design.select(v.id)}
              >
                Versión {v.number}
              </button>
            ))}
          </nav>
        )}
      </section>
      <DesignChat
        messages={project?.messages ?? []}
        greeting={
          firstDesign
            ? "Hola, soy KIT Design. Suelta las fotos o el plano del salón y cuéntame qué evento es: tipo, invitados, estilo y lo que no puede faltar. Te devuelvo el diseño en imágenes y en un video con aspecto 3D."
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
        working={project ? workingLabel(project) : ""}
        note={project ? allowanceNote(status, project) : undefined}
        onRestart={
          canEdit &&
          project &&
          (project.versions.length || project.messages.length)
            ? () => void restartDesign()
            : undefined
        }
        onSubmit={async (text) => {
          if (firstDesign && text.length < MIN_BRIEF_LENGTH) {
            toast("Describe el evento con un poco más de detalle.");
            return false;
          }
          setViewIndex(0);
          return design.send(text);
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
  project: DesignProject;
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
            <img src={image.url} alt={image.name} />
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
      {project.images.length < MAX_ROOM_IMAGES && !project.job && (
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

/** The finished design: the video when there is one, otherwise the 3D-looking image. */
function Viewer({
  render,
  video,
  label,
  making,
}: {
  render: DesignVersion["renders"][number];
  video?: DesignProject["videos"][number];
  label: string;
  making: boolean;
}) {
  const sample = isFixtureRender(video ?? render);
  return (
    <figure className="kd-viewer">
      <div className="kd-viewer-frame">
        {video ? (
          <video
            src={video.url}
            poster={render.url}
            controls
            loop
            muted
            playsInline
            autoPlay
            aria-label={`${label}: video del diseño`}
          />
        ) : (
          <img src={render.url} alt={label} />
        )}
        {making && (
          <span className="kd-viewer-making" role="status">
            Creando el video…
          </span>
        )}
        {sample && (
          <span className="kd-sample-band" aria-hidden="true">
            Muestra: sin motor de {video ? "video" : "imágenes"} conectado
          </span>
        )}
      </div>
      <figcaption className="muted">Visualización, no a escala</figcaption>
    </figure>
  );
}

function Result({
  event,
  project,
  version,
  pending,
  viewIndex,
  onView,
  canEdit,
  busy,
  onApply,
  onDiscard,
  onVideo,
}: {
  event: ProductionEvent;
  project: DesignProject;
  version: DesignVersion;
  pending: boolean;
  viewIndex: number;
  onView: (index: number) => void;
  canEdit: boolean;
  busy: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onVideo: (renderId: string) => void;
}) {
  const { data, user } = useWorkspace();
  const [proposalOpen, setProposalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const render = version.renders[viewIndex];
  const video = project.videos.find((v) => v.renderId === render?.id);
  const stock = checkDesignInventory(
    version.spec,
    event,
    data.equipment,
    data.reservations,
  );
  const canPropose =
    !pending && canEditCollection(user, "proposals") && stock.length > 0;
  return (
    <div className="kd-result">
      {pending && (
        <div className="kd-pending" role="status">
          <span>
            <strong>Cambio pendiente · Versión {version.number}:</strong>{" "}
            {version.request}
          </span>
          {canEdit && (
            <div className="kd-pending-actions">
              <Button variant="secondary" disabled={busy} onClick={onDiscard}>
                <Undo2 size={16} />
                Descartar
              </Button>
              <Button disabled={busy} onClick={onApply}>
                <Check size={16} />
                Aplicar
              </Button>
            </div>
          )}
        </div>
      )}
      {render && (
        <Viewer
          key={render.id}
          render={render}
          video={project.videos.find((v) => v.renderId === render.id)}
          label={`Vista ${viewIndex + 1}`}
          making={
            project.job?.kind === "video" && project.job.renderId === render.id
          }
        />
      )}
      <div className="kd-result-bar">
        {version.renders.length > 1 ? (
          <div className="kd-views" role="group" aria-label="Vistas">
            {version.renders.map((r, index) => (
              <button
                key={r.id}
                type="button"
                className={`kd-view ${index === viewIndex ? "active" : ""}`}
                aria-pressed={index === viewIndex}
                aria-label={`Vista ${index + 1}`}
                onClick={() => onView(index)}
              >
                <img src={r.url} alt="" />
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <div className="kd-result-actions">
          {render && !video && canEdit && !pending && (
            <Button
              variant="secondary"
              disabled={busy || !!project.job}
              onClick={() => onVideo(render.id)}
            >
              <Video size={16} />
              Crear video
            </Button>
          )}
          {render && (
            <a
              className="button ghost"
              href={video ? video.url : render.url}
              download={`diseno-v${version.number}-vista-${viewIndex + 1}${video ? ".mp4" : ""}`}
            >
              <Download size={16} />
              {video ? "Descargar video" : "Descargar"}
            </a>
          )}
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => setPrintOpen(true)}
          >
            <Printer size={16} />
            Exportar PDF
          </Button>
          {canPropose && (
            <Button variant="secondary" onClick={() => setProposalOpen(true)}>
              <FilePlus2 size={16} />
              Añadir a la propuesta
            </Button>
          )}
        </div>
      </div>
      <details className="kd-equipment" open>
        <summary>
          Equipo en el diseño · {version.spec.items.length} artículos
        </summary>
        <ul>
          {version.spec.items.map((item, index) => {
            const known = data.equipment.find((e) => e.id === item.equipmentId);
            const check = stock.find((s) => s.equipmentId === item.equipmentId);
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
                {check &&
                  (check.short > 0 ? (
                    <Badge tone="red">
                      {`Faltan ${check.short} · ${check.available} libres`}
                    </Badge>
                  ) : (
                    <Badge tone="green">Disponible</Badge>
                  ))}
              </li>
            );
          })}
        </ul>
        {version.spec.room.measured === "estimated" && (
          <p className="muted">{version.spec.room.notes}</p>
        )}
      </details>
      {proposalOpen && (
        <AddToProposal
          event={event}
          project={project}
          version={version}
          onClose={() => setProposalOpen(false)}
        />
      )}
      {printOpen && (
        <PrintSheet
          event={event}
          project={project}
          version={version}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  );
}

/** add_to_proposal: always an explicit confirmation; the server re-checks permission and validity on save. */
function AddToProposal({
  event,
  project,
  version,
  onClose,
}: {
  event: ProductionEvent;
  project: DesignProject;
  version: DesignVersion;
  onClose: () => void;
}) {
  const { data, update, toast } = useWorkspace();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [plan] = useState(() =>
    designToProposal({
      spec: version.spec,
      event,
      proposals: data.proposals,
      equipment: data.equipment,
      newId: id,
      versionNumber: version.number,
    }),
  );
  const realRenders = version.renders.filter((r) => !isFixtureRender(r));
  const [includeRenders, setIncludeRenders] = useState(realRenders.length > 0);
  // Renders enter the document by reference (max 12 visuals), never copied inline.
  const withRenders = () => {
    if (!includeRenders) return plan.proposal;
    const visuals = [...(plan.proposal.visuals || [])];
    for (const render of realRenders) {
      if (visuals.length >= 12) break;
      if (
        visuals.some(
          (v) => v.sourceType === "KIT Design" && v.sourceId === render.id,
        )
      )
        continue;
      visuals.push(
        createDesignProposalVisual({
          id: id(),
          render,
          designTitle: project.title,
          versionNumber: version.number,
          addedAt: new Date().toISOString(),
        }),
      );
    }
    return { ...plan.proposal, visuals };
  };
  async function confirm() {
    setSaving(true);
    const proposal = withRenders();
    const saved = await update((s) => ({
      ...s,
      proposals: plan.created
        ? [...s.proposals, proposal]
        : s.proposals.map((p) => (p.id === proposal.id ? proposal : p)),
      activity: [
        activity(
          "Equipo del diseño añadido a la propuesta",
          `${plan.proposal.number} · Diseño versión ${version.number}`,
          event.id,
        ),
        ...s.activity,
      ],
    }));
    setSaving(false);
    if (!saved) return;
    toast("Equipo añadido a la propuesta.");
    onClose();
    navigate(`/proposals/${plan.proposal.id}`);
  }
  return (
    <Modal
      title="Añadir el equipo a la propuesta"
      description={
        plan.created
          ? "Este evento no tiene un borrador de propuesta. Se creará uno nuevo con este equipo."
          : `Se actualizará el borrador ${plan.proposal.number}. Las líneas existentes solo aumentan, nunca se reducen.`
      }
      onClose={onClose}
    >
      <div className="modal-body">
        {plan.changes.length ? (
          <ul className="kd-proposal-changes">
            {plan.changes.map((c) => (
              <li key={c.label}>
                <span>{c.label}</span>
                <span className="muted">
                  {c.before ? `${c.before} → ${c.after}` : `+${c.after}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p>La propuesta ya incluye todo el equipo del diseño.</p>
        )}
        {plan.skipped.length > 0 && (
          <p className="muted">
            No se añaden porque no están en el catálogo:{" "}
            {plan.skipped.join(", ")}.
          </p>
        )}
        {realRenders.length > 0 && (
          <label className="kd-include-renders">
            <input
              type="checkbox"
              checked={includeRenders}
              onChange={(e) => setIncludeRenders(e.target.checked)}
            />{" "}
            Incluir{" "}
            {realRenders.length === 1
              ? "el render"
              : `los ${realRenders.length} renders`}{" "}
            de esta versión como imágenes del documento
          </label>
        )}
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={saving || (!plan.changes.length && !includeRenders)}
          onClick={() => void confirm()}
        >
          <Check size={16} />
          Confirmar
        </Button>
      </div>
    </Modal>
  );
}

/** A sheet for the client: renders and equipment, printed with the browser (Guardar como PDF). */
function PrintSheet({
  event,
  project,
  version,
  onClose,
}: {
  event: ProductionEvent;
  project: DesignProject;
  version: DesignVersion;
  onClose: () => void;
}) {
  const sample = version.renders.some(isFixtureRender);
  return (
    <Modal
      wide
      title="Exportar diseño"
      description="Usa «Guardar como PDF» en el diálogo de impresión."
      onClose={onClose}
    >
      <div className="print-proposal kd-print-sheet">
        <header>
          <h2>{event.name}</h2>
          <p>
            Diseño · versión {version.number} ·{" "}
            {new Date(version.createdAt).toLocaleDateString("es")}
          </p>
        </header>
        {version.renders.map((r, index) => {
          const source = project.images.find((i) => i.id === r.sourceImageId);
          return (
            <figure key={r.id}>
              <img src={r.url} alt={`Vista ${index + 1}`} />
              <figcaption>
                Vista {index + 1}
                {source ? ` · a partir de ${source.name}` : ""}
                {sample ? " · MUESTRA" : ""}
              </figcaption>
            </figure>
          );
        })}
        <h3>Equipo</h3>
        <ul>
          {version.spec.items.map((item, index) => (
            <li key={`${item.label}-${index}`}>
              {item.quantity}× {item.label} — {item.placement}
            </li>
          ))}
        </ul>
        <p className="kd-print-note">
          Visualización, no a escala. {version.spec.room.notes}
        </p>
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cerrar
        </Button>
        <Button onClick={() => window.print()}>
          <Printer size={16} />
          Imprimir / PDF
        </Button>
      </div>
    </Modal>
  );
}
