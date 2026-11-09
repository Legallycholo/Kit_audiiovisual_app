import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  CalendarPlus,
  Check,
  Download,
  FilePlus2,
  Printer,
  Undo2,
  X,
} from "lucide-react";
import { activity, useWorkspace } from "../../shared/store";
import { canEditCollection } from "../../shared/access";
import { id } from "../../shared/domain";
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
  type DesignVersion,
} from "../../shared/kit-design";
import type { ProductionEvent } from "../../shared/types";
import { BeforeAfter } from "./BeforeAfter";
import { DesignChat } from "./DesignChat";
import { DropZone } from "./DropZone";
import { prepareRoomImage } from "./prepare-image";
import { useDesign } from "./client";

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
  return project.job.kind === "create"
    ? "Leyendo el salón… diseñando el montaje… generando vistas. Puede tardar un par de minutos."
    : "Preparando el cambio y generando las vistas nuevas…";
}

/** The render allowance shown under the chat when renders cost money (plan §4: cost before rendering). */
function allowanceNote(status: DesignStatus | null, project: DesignProject) {
  if (!status || status.renderer === "fixture") return undefined;
  const views = project.versions.length
    ? (project.versions.find((v) => v.id === project.currentVersionId)?.renders
        .length ?? 0)
    : project.images.length;
  return `Cada mensaje genera ${views} ${views === 1 ? "render" : "renders"} · ${status.usage.renders} de ${status.usage.cap} usados este mes`;
}

function DesignWorkspace({ event }: { event: ProductionEvent }) {
  const { toast } = useWorkspace();
  const design = useDesign(event.id);
  const { project, status } = design;
  const [preparing, setPreparing] = useState(false);
  const [viewIndex, setViewIndex] = useState(0);
  if (!project)
    return design.error ? (
      <ErrorNote>{design.error}</ErrorNote>
    ) : (
      <p className="muted" aria-busy="true">
        Cargando diseño…
      </p>
    );
  const canEdit = status?.canEdit ?? false;
  const current = project.versions.find(
    (v) => v.id === project.currentVersionId,
  );
  const shown: DesignVersion | undefined = project.pendingVersion || current;
  const firstDesign = !project.versions.length;

  async function takeFiles(files: File[]) {
    const room = MAX_ROOM_IMAGES - project!.images.length;
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
      if (ready.length) await design.upload(ready);
    } finally {
      setPreparing(false);
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
        {!project.images.length ? (
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
        working={workingLabel(project)}
        note={allowanceNote(status, project)}
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
}) {
  const { data, user } = useWorkspace();
  const [proposalOpen, setProposalOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const render = version.renders[viewIndex];
  const source = project.images.find((i) => i.id === render?.sourceImageId);
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
      {render && source && (
        <BeforeAfter
          key={render.id}
          before={source.url}
          after={render.url}
          label={`Vista ${viewIndex + 1}`}
          sample={isFixtureRender(render)}
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
          {render && (
            <a
              className="button ghost"
              href={render.url}
              download={`diseno-v${version.number}-vista-${viewIndex + 1}`}
            >
              <Download size={16} />
              Descargar
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
  version,
  onClose,
}: {
  event: ProductionEvent;
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
  async function confirm() {
    setSaving(true);
    const saved = await update((s) => ({
      ...s,
      proposals: plan.created
        ? [...s.proposals, plan.proposal]
        : s.proposals.map((p) =>
            p.id === plan.proposal.id ? plan.proposal : p,
          ),
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
      </div>
      <div className="modal-actions">
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          disabled={saving || !plan.changes.length}
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
