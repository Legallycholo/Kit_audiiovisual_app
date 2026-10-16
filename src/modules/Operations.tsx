import { UserManagement } from "./UserManagement";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Box,
  Bus,
  CalendarDays,
  ChartNoAxesCombined,
  Clock3,
  CircleDollarSign,
  Download,
  FileText,
  Image,
  Plus,
  RefreshCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
  Gauge,
  ListChecks,
  Video,
  WandSparkles,
  Wrench,
} from "lucide-react";
import { useWorkspace, activity } from "../shared/store";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Panel,
  Placeholder,
  Stat,
  Tabs,
} from "../shared/ui";
import {
  downloadFile,
  actualEventCosts,
  crewShiftConflicts,
  id,
  initials,
  money,
  productionReadiness,
  quoteTotals,
  shortDate,
} from "../shared/domain";
import { canEditCollection } from "../shared/access";
import { createShowcaseCreativeAsset } from "../shared/creative";
import {
  automationCandidates,
  currentProposals,
  dataQualityReport,
  financialReport,
  metricDefinitions,
  performanceReport,
  pipelineReport,
  utilizationReport,
  workloadReport,
} from "../shared/reporting";
import type {
  ActualCost,
  AutomationRecord,
  CreativeKind,
  CrewShift,
  EventOperations,
  EventStatus,
  OnsiteChange,
  RunCue,
  Task,
  TransportAssignment,
  Workspace,
} from "../shared/types";

const emptyOperations = (eventId: string): EventOperations => ({
  id: id(),
  eventId,
  crewShifts: [],
  cues: [],
  transports: [],
  changes: [],
  costs: [],
});
function changeOperations(
  workspace: Workspace,
  eventId: string,
  change: (record: EventOperations) => EventOperations,
) {
  const current = workspace.operations.find((item) => item.eventId === eventId);
  const next = change(
    current ? structuredClone(current) : emptyOperations(eventId),
  );
  return current
    ? workspace.operations.map((item) =>
        item.eventId === eventId ? next : item,
      )
    : [...workspace.operations, next];
}
const dateTimeLabel = (value: string) =>
  new Intl.DateTimeFormat("es-PR", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
export function Production() {
  const { data, update, toast, mode, user, request } = useWorkspace();
  const [params] = useSearchParams();
  const [eventFilter, setEventFilter] = useState(params.get("event") || "all");
  const [tab, setTab] = useState("Task board");
  const [draft, setDraft] = useState<Task | null>(null);
  const [members, setMembers] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [teamError, setTeamError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [shiftDraft, setShiftDraft] = useState<
    (CrewShift & { eventId: string }) | null
  >(null);
  const [cueDraft, setCueDraft] = useState<
    (RunCue & { eventId: string }) | null
  >(null);
  const [transportDraft, setTransportDraft] = useState<
    (TransportAssignment & { eventId: string }) | null
  >(null);
  const [changeDraft, setChangeDraft] = useState<
    (OnsiteChange & { eventId: string }) | null
  >(null);
  const [costDraft, setCostDraft] = useState<
    (ActualCost & { eventId: string }) | null
  >(null);
  useEffect(() => {
    let active = true;
    setMembers([]);
    setTeamError("");
    if (
      mode === "company" &&
      draft?.eventId &&
      ["Administrator", "Production Manager"].includes(user?.role || "")
    )
      request<{ members: typeof members }>(
        `/team?eventId=${encodeURIComponent(draft.eventId)}`,
      )
        .then((result) => {
          if (active) setMembers(result.members);
        })
        .catch((error) => {
          if (active) setTeamError(error.message);
        });
    return () => {
      active = false;
    };
  }, [mode, draft?.eventId, user?.role, request]);
  const tasks = data.tasks.filter(
    (t) => eventFilter === "all" || t.eventId === eventFilter,
  );
  const crew = Array.from(new Set(data.tasks.map((t) => t.assignee)));
  const readinessEvents = data.events.filter(
    (event) => eventFilter === "all" || event.id === eventFilter,
  );
  const canManageProduction =
    !user || ["Administrator", "Production Manager"].includes(user.role);
  const selectedEventId =
    eventFilter === "all" ? data.events[0]?.id || "" : eventFilter;
  const visibleOperations = data.operations.filter(
    (operation) => eventFilter === "all" || operation.eventId === eventFilter,
  );
  const changeProductionStatus = async (
    eventId: string,
    status: EventStatus,
  ) => {
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return;
    if (
      await update((workspace) => ({
        ...workspace,
        events: workspace.events.map((item) =>
          item.id === eventId ? { ...item, status } : item,
        ),
        activity: [
          activity(
            status === "Completed"
              ? "Production closeout confirmed"
              : "Production status confirmed",
            `${event.name}: ${status}`,
            eventId,
          ),
          ...workspace.activity,
        ],
      }))
    )
      toast(
        status === "Completed"
          ? "Cierre de producción confirmado."
          : "Estado de producción confirmado.",
      );
  };
  return (
    <>
      <PageHeader
        eyebrow="GOOD PEOPLE. GREAT PRODUCTIONS."
        title="Team & production"
        description="Keep the crew aligned, the gear ready, and the show on schedule."
        actions={
          <Button
            disabled={Boolean(
              user &&
              !["Administrator", "Production Manager"].includes(user.role),
            )}
            onClick={() =>
              setDraft({
                id: id(),
                eventId:
                  eventFilter === "all"
                    ? data.events[0]?.id || ""
                    : eventFilter,
                title: "",
                assignee: "Alex Morgan",
                role: "Production manager",
                date: "",
                done: false,
                phase: "Planning",
              })
            }
          >
            <Plus size={17} />
            Add task
          </Button>
        }
      />
      <div className="directory-toolbar">
        <Tabs
          items={[
            "Task board",
            "Crew schedule",
            "Run of show",
            "Preparation & returns",
            "Logistics & costs",
            "Production readiness",
          ]}
          value={tab}
          onChange={setTab}
        />
        <select
          aria-label="Filter production by event"
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
        >
          <option value="all">All events</option>
          {data.events.map((e) => (
            <option value={e.id} key={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </div>
      {tab === "Task board" && (
        <div className="kanban">
          {["Planning", "Preparation", "Completed"].map((column) => {
            const entries = tasks.filter((t) =>
              column === "Completed" ? t.done : !t.done && t.phase === column,
            );
            return (
              <section key={column}>
                <header>
                  <span
                    className={`mini-dot ${column === "Completed" ? "green" : column === "Planning" ? "blue" : "amber"}`}
                  />
                  <h2>{column}</h2>
                  <span>{entries.length}</span>
                </header>
                {entries.map((t) => (
                  <article className="task-card" key={t.id}>
                    <span className="eyebrow">
                      {data.events.find((e) => e.id === t.eventId)?.name}
                    </span>
                    <h3>{t.title}</h3>
                    <div>
                      <Avatar label={initials(t.assignee)} small />
                      <span>{t.assignee}</span>
                    </div>
                    <footer>
                      <span>
                        <CalendarDays size={13} />
                        {shortDate(t.date)}
                      </span>
                      <label>
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() =>
                            update((s) => ({
                              ...s,
                              tasks: s.tasks.map((task) =>
                                task.id === t.id
                                  ? { ...task, done: !task.done }
                                  : task,
                              ),
                              activity: [
                                activity(
                                  t.done ? "Task reopened" : "Task completed",
                                  t.title,
                                  t.eventId,
                                ),
                                ...s.activity,
                              ],
                            }))
                          }
                        />
                        {t.done ? "Done" : "Mark done"}
                      </label>
                    </footer>
                  </article>
                ))}
                {entries.length === 0 && (
                  <div className="kanban-empty">Nothing here yet.</div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {tab === "Crew schedule" && (
        <div>
          <div className="section-heading">
            <div>
              <h2>Turnos y conflictos de personal</h2>
              <p>
                Los turnos solapados de una misma persona se bloquean entre
                eventos.
              </p>
            </div>
            <Button
              disabled={
                !canEditCollection(user, "operations") || !selectedEventId
              }
              onClick={() => {
                const event = data.events.find(
                  (item) => item.id === selectedEventId,
                );
                if (!event) return;
                setShiftDraft({
                  id: id(),
                  eventId: event.id,
                  person: crew[0] || "",
                  role: "Technician",
                  start: `${event.date}T08:00`,
                  end: `${event.date}T17:00`,
                  status: "Scheduled",
                  cost: 0,
                });
              }}
            >
              <Plus size={16} /> Add shift
            </Button>
          </div>
          <div className="crew-grid">
            {visibleOperations.flatMap((operation) =>
              operation.crewShifts.map((shift) => {
                const event = data.events.find(
                  (item) => item.id === operation.eventId,
                );
                return (
                  <Panel key={shift.id}>
                    <div className="panel-body">
                      <div className="profile-header">
                        <Avatar label={initials(shift.person)} />
                        <div>
                          <h3>{shift.person}</h3>
                          <p>{shift.role}</p>
                        </div>
                        <Badge
                          tone={
                            shift.status === "Completed" ? "green" : "neutral"
                          }
                        >
                          {shift.status}
                        </Badge>
                      </div>
                      <div className="crew-assignment">
                        <span>{dateTimeLabel(shift.start)}</span>
                        <strong>{event?.name}</strong>
                        <span>
                          to {dateTimeLabel(shift.end)} · {money(shift.cost)}
                        </span>
                      </div>
                      {canEditCollection(user, "operations") &&
                        shift.status === "Scheduled" && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void update((workspace) => ({
                                ...workspace,
                                operations: changeOperations(
                                  workspace,
                                  operation.eventId,
                                  (record) => ({
                                    ...record,
                                    crewShifts: record.crewShifts.map((item) =>
                                      item.id === shift.id
                                        ? { ...item, status: "Completed" }
                                        : item,
                                    ),
                                  }),
                                ),
                              }))
                            }
                          >
                            Mark completed
                          </Button>
                        )}
                    </div>
                  </Panel>
                );
              }),
            )}
          </div>
          {visibleOperations.every(
            (operation) => operation.crewShifts.length === 0,
          ) && (
            <Empty
              title="No scheduled shifts"
              description="Add dated crew coverage for an event."
            />
          )}
        </div>
      )}
      {tab === "Run of show" && (
        <Panel
          title="Timed run of show"
          subtitle="Department cues remain linked to an owner and execution state."
          action={
            <Button
              disabled={
                !canEditCollection(user, "operations") || !selectedEventId
              }
              onClick={() => {
                const event = data.events.find(
                  (item) => item.id === selectedEventId,
                );
                if (!event) return;
                setCueDraft({
                  id: id(),
                  eventId: event.id,
                  at: `${event.date}T09:00`,
                  title: "",
                  department: "Production",
                  owner: crew[0] || "Production manager",
                  notes: "",
                  status: "Pending",
                });
              }}
            >
              <Plus size={16} /> Add cue
            </Button>
          }
        >
          <div className="panel-body">
            {visibleOperations
              .flatMap((operation) =>
                operation.cues.map((cue) => ({
                  cue,
                  eventId: operation.eventId,
                })),
              )
              .sort((a, b) => a.cue.at.localeCompare(b.cue.at))
              .map(({ cue, eventId }) => (
                <div className="timeline-item" key={cue.id}>
                  <span className="date-pill">{dateTimeLabel(cue.at)}</span>
                  <div>
                    <strong>{cue.title}</strong>
                    <p>
                      {cue.department} · {cue.owner} ·{" "}
                      {data.events.find((event) => event.id === eventId)?.name}
                    </p>
                    {cue.notes && <small>{cue.notes}</small>}
                  </div>
                  <Badge tone={cue.status === "Complete" ? "green" : "neutral"}>
                    {cue.status}
                  </Badge>
                  {canEditCollection(user, "operations") &&
                    cue.status === "Pending" && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void update((workspace) => ({
                            ...workspace,
                            operations: changeOperations(
                              workspace,
                              eventId,
                              (record) => ({
                                ...record,
                                cues: record.cues.map((item) =>
                                  item.id === cue.id
                                    ? { ...item, status: "Complete" }
                                    : item,
                                ),
                              }),
                            ),
                          }))
                        }
                      >
                        Complete
                      </Button>
                    )}
                </div>
              ))}
            {visibleOperations.every(
              (operation) => operation.cues.length === 0,
            ) && (
              <Empty
                title="No run-of-show cues"
                description="Add the first timed cue for this event."
              />
            )}
          </div>
        </Panel>
      )}
      {tab === "Preparation & returns" && (
        <Panel
          title="Equipment handoff"
          action={
            <Link className="text-link" to="/inventory">
              Manage allocations
              <ArrowUpRight size={15} />
            </Link>
          }
        >
          <div className="panel-body">
            {data.reservations
              .filter((r) => eventFilter === "all" || r.eventId === eventFilter)
              .map((r) => (
                <div className="simple-row" key={r.id}>
                  <Box size={20} />
                  <div>
                    <strong>
                      {r.quantity} ×{" "}
                      {data.equipment.find((q) => q.id === r.equipmentId)?.name}
                    </strong>
                    <small>
                      {data.events.find((e) => e.id === r.eventId)?.name} ·
                      return {shortDate(r.end)} · {r.source || "Owned"}
                      {r.substituteEquipmentId
                        ? ` · substitute: ${data.equipment.find((item) => item.id === r.substituteEquipmentId)?.name}`
                        : ""}
                    </small>
                    {r.dispatchedQuantity ||
                    r.returnedQuantity ||
                    r.damagedQuantity ? (
                      <small>
                        {r.dispatchedQuantity || 0} dispatched ·{" "}
                        {r.returnedQuantity || 0} returned ·{" "}
                        {r.damagedQuantity || 0} damaged
                      </small>
                    ) : null}
                  </div>
                  <Badge>{r.status}</Badge>
                </div>
              ))}
            {data.reservations.filter(
              (r) => eventFilter === "all" || r.eventId === eventFilter,
            ).length === 0 && (
              <Empty
                title="No equipment handoffs"
                description="Create reservations in inventory first."
              />
            )}
          </div>
        </Panel>
      )}
      {tab === "Logistics & costs" && (
        <div className="detail-grid">
          <Panel
            title="Transport"
            action={
              <Button
                disabled={
                  !canEditCollection(user, "operations") || !selectedEventId
                }
                onClick={() => {
                  const event = data.events.find(
                    (item) => item.id === selectedEventId,
                  );
                  if (!event) return;
                  setTransportDraft({
                    id: id(),
                    eventId: event.id,
                    kind: "Outbound",
                    provider: data.settings.company,
                    vehicle: "",
                    driver: "",
                    departureAt: `${event.date}T07:00`,
                    arrivalAt: `${event.date}T08:00`,
                    status: "Planned",
                    cost: 0,
                    notes: "",
                  });
                }}
              >
                <Plus size={16} /> Add transport
              </Button>
            }
          >
            <div className="panel-body">
              {visibleOperations.flatMap((operation) =>
                operation.transports.map((transport) => (
                  <div className="simple-row" key={transport.id}>
                    <Bus size={20} />
                    <div>
                      <strong>
                        {transport.kind} · {transport.vehicle}
                      </strong>
                      <small>
                        {transport.driver} ·{" "}
                        {dateTimeLabel(transport.departureAt)} →{" "}
                        {dateTimeLabel(transport.arrivalAt)}
                      </small>
                    </div>
                    <strong>{money(transport.cost)}</strong>
                    <Badge>{transport.status}</Badge>
                    {canEditCollection(user, "operations") &&
                      ["Planned", "In transit"].includes(transport.status) && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void update((workspace) => ({
                              ...workspace,
                              operations: changeOperations(
                                workspace,
                                operation.eventId,
                                (record) => ({
                                  ...record,
                                  transports: record.transports.map((item) =>
                                    item.id === transport.id
                                      ? {
                                          ...item,
                                          status:
                                            transport.status === "Planned"
                                              ? "In transit"
                                              : "Complete",
                                        }
                                      : item,
                                  ),
                                }),
                              ),
                            }))
                          }
                        >
                          {transport.status === "Planned"
                            ? "Dispatch"
                            : "Complete"}
                        </Button>
                      )}
                  </div>
                )),
              )}
            </div>
          </Panel>
          <Panel
            title="Onsite change log"
            action={
              <Button
                disabled={
                  !canEditCollection(user, "operations") || !selectedEventId
                }
                onClick={() =>
                  setChangeDraft({
                    id: id(),
                    eventId: selectedEventId,
                    title: "",
                    detail: "",
                    impact: "",
                    recordedAt: new Date().toISOString(),
                    recordedBy: user?.name || "Sample user",
                    costImpact: 0,
                  })
                }
              >
                <Plus size={16} /> Record change
              </Button>
            }
          >
            <div className="panel-body">
              {visibleOperations.flatMap((operation) =>
                operation.changes.map((change) => (
                  <div className="simple-row" key={change.id}>
                    <Wrench size={20} />
                    <div>
                      <strong>{change.title}</strong>
                      <small>
                        {change.detail} · {change.impact}
                      </small>
                    </div>
                    <span>{money(change.costImpact)}</span>
                  </div>
                )),
              )}
            </div>
          </Panel>
          {readinessEvents.map((event) => {
            const accepted = data.proposals
              .filter(
                (proposal) =>
                  proposal.eventId === event.id &&
                  proposal.status === "Accepted",
              )
              .sort((a, b) => b.version - a.version)[0];
            const quoted = accepted
              ? quoteTotals(accepted.lines, accepted.discount, accepted.tax)
                  .total
              : 0;
            const actual = actualEventCosts(data, event.id);
            return (
              <Panel
                key={event.id}
                title={`Costos reales · ${event.name}`}
                action={
                  <Button
                    disabled={!canEditCollection(user, "operations")}
                    onClick={() =>
                      setCostDraft({
                        id: id(),
                        eventId: event.id,
                        category: "Other",
                        description: "",
                        amount: 0,
                        incurredAt: new Date().toLocaleDateString("en-CA"),
                      })
                    }
                  >
                    <Plus size={16} /> Add cost
                  </Button>
                }
              >
                <div className="panel-body">
                  <div className="simple-row">
                    <span>Propuesta aceptada</span>
                    <strong>
                      {accepted ? money(quoted) : "Sin propuesta aceptada"}
                    </strong>
                  </div>
                  <div className="simple-row">
                    <span>Personal programado</span>
                    <strong>{money(actual.crew)}</strong>
                  </div>
                  <div className="simple-row">
                    <span>Asignaciones de transporte</span>
                    <strong>{money(actual.transport)}</strong>
                  </div>
                  <div className="simple-row">
                    <span>Alquileres de proveedores</span>
                    <strong>{money(actual.supplierRentals)}</strong>
                  </div>
                  <div className="simple-row">
                    <span>Reparaciones por devolución</span>
                    <strong>{money(actual.repairs)}</strong>
                  </div>
                  <div className="simple-row">
                    <span>Otros costos reales registrados</span>
                    <strong>{money(actual.recorded)}</strong>
                  </div>
                  <div className="simple-row">
                    <strong>Costo real total</strong>
                    <strong>{money(actual.total)}</strong>
                  </div>
                  {data.operations
                    .find((operation) => operation.eventId === event.id)
                    ?.costs.map((cost) => (
                      <div className="simple-row" key={cost.id}>
                        <span>
                          {cost.category} · {cost.description}
                        </span>
                        <strong>{money(cost.amount)}</strong>
                      </div>
                    ))}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      {tab === "Production readiness" && (
        <div className="readiness-grid">
          {readinessEvents.map((event) => {
            const readiness = productionReadiness(data, event.id);
            const nextStatus =
              event.status === "Preparation"
                ? "In production"
                : event.status === "In production"
                  ? "Completed"
                  : "Preparation";
            const actionReady =
              nextStatus === "Completed"
                ? readiness.closeoutReady
                : readiness.ready;
            return (
              <Panel
                key={event.id}
                title={event.name}
                subtitle={`${shortDate(event.date)}–${shortDate(event.endDate)}`}
                action={<Badge>{event.status}</Badge>}
              >
                <div className="panel-body readiness-checklist">
                  <div className="simple-row">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>Alcance comercial aceptado</strong>
                      <small>
                        {readiness.acceptedProposal
                          ? `${readiness.acceptedProposal.number} · versión ${readiness.acceptedProposal.version}`
                          : "No hay una propuesta aceptada por el propietario."}
                      </small>
                    </div>
                    <Badge
                      tone={readiness.acceptedScopeReady ? "green" : "amber"}
                    >
                      {readiness.acceptedScopeReady ? "Listo" : "Pendiente"}
                    </Badge>
                  </div>
                  <div className="simple-row">
                    <Box size={20} />
                    <div>
                      <strong>Equipos confirmados</strong>
                      <small>
                        {readiness.requirements.length
                          ? `${readiness.requirements.filter((item) => item.confirmed >= item.required).length}/${readiness.requirements.length} artículos cubiertos para las fechas del evento`
                          : "El alcance aceptado no incluye equipos del catálogo."}
                      </small>
                    </div>
                    <Badge tone={readiness.equipmentReady ? "green" : "amber"}>
                      {readiness.equipmentReady ? "Listo" : "Pendiente"}
                    </Badge>
                  </div>
                  <div className="simple-row">
                    <Users size={20} />
                    <div>
                      <strong>Responsables de producción</strong>
                      <small>
                        {
                          data.tasks.filter((task) => task.eventId === event.id)
                            .length
                        }{" "}
                        tareas de producción
                      </small>
                    </div>
                    <Badge tone={readiness.crewReady ? "green" : "amber"}>
                      {readiness.crewReady ? "Listo" : "Pendiente"}
                    </Badge>
                  </div>
                  {(nextStatus === "Completed"
                    ? readiness.closeoutBlockers
                    : readiness.blockers
                  ).length > 0 && (
                    <div className="readiness-blockers">
                      <strong>
                        {nextStatus === "Completed"
                          ? "Antes de cerrar"
                          : "Antes de confirmar preparación"}
                      </strong>
                      <ul>
                        {(nextStatus === "Completed"
                          ? readiness.closeoutBlockers
                          : readiness.blockers
                        ).map((blocker) => (
                          <li key={blocker}>{blocker}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {readiness.acceptedProposal && (
                    <Link
                      className="text-link"
                      to={`/proposals/${readiness.acceptedProposal.id}`}
                    >
                      Revisar alcance aceptado
                      <ArrowUpRight size={15} />
                    </Link>
                  )}
                  {!(["Completed", "Cancelled"] as EventStatus[]).includes(
                    event.status,
                  ) && (
                    <Button
                      disabled={!canManageProduction || !actionReady}
                      onClick={() =>
                        void changeProductionStatus(event.id, nextStatus)
                      }
                    >
                      {nextStatus === "Preparation"
                        ? "Confirmar preparación"
                        : nextStatus === "In production"
                          ? "Iniciar producción"
                          : "Confirmar cierre"}
                    </Button>
                  )}
                </div>
              </Panel>
            );
          })}
          {readinessEvents.length === 0 && (
            <Empty
              title="No hay eventos"
              description="Selecciona un evento para revisar su preparación."
            />
          )}
        </div>
      )}
      {shiftDraft && (
        <Modal
          title="Crew shift"
          onClose={() => {
            setShiftDraft(null);
            setOperationError("");
          }}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const normalized = {
                ...shiftDraft,
                start: new Date(shiftDraft.start).toISOString(),
                end: new Date(shiftDraft.end).toISOString(),
              };
              const { eventId, ...shift } = normalized;
              const conflicts = crewShiftConflicts(
                data.operations,
                shift,
                eventId,
              );
              if (conflicts.length) {
                const conflictEvent = data.events.find(
                  (item) => item.id === conflicts[0].eventId,
                );
                setOperationError(
                  `${shift.person} already has an overlapping shift for ${conflictEvent?.name || "another event"}.`,
                );
                return;
              }
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({
                      ...record,
                      crewShifts: [...record.crewShifts, shift],
                    }),
                  ),
                  activity: [
                    activity(
                      "Crew shift scheduled",
                      `${shift.person} · ${shift.role}`,
                      eventId,
                    ),
                    ...workspace.activity,
                  ],
                }))
              ) {
                setShiftDraft(null);
                setOperationError("");
                toast("Crew shift scheduled.");
              }
            }}
          >
            {operationError && <ErrorNote>{operationError}</ErrorNote>}
            <Field label="Event">
              <select
                value={shiftDraft.eventId}
                onChange={(event) =>
                  setShiftDraft({ ...shiftDraft, eventId: event.target.value })
                }
              >
                {data.events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Crew member">
                <input
                  required
                  value={shiftDraft.person}
                  onChange={(event) =>
                    setShiftDraft({
                      ...shiftDraft,
                      person: event.target.value,
                      memberId: undefined,
                    })
                  }
                />
              </Field>
              <Field label="Role">
                <input
                  required
                  value={shiftDraft.role}
                  onChange={(event) =>
                    setShiftDraft({ ...shiftDraft, role: event.target.value })
                  }
                />
              </Field>
              <Field label="Starts">
                <input
                  required
                  type="datetime-local"
                  value={shiftDraft.start.slice(0, 16)}
                  onChange={(event) =>
                    setShiftDraft({ ...shiftDraft, start: event.target.value })
                  }
                />
              </Field>
              <Field label="Ends">
                <input
                  required
                  type="datetime-local"
                  value={shiftDraft.end.slice(0, 16)}
                  onChange={(event) =>
                    setShiftDraft({ ...shiftDraft, end: event.target.value })
                  }
                />
              </Field>
              <Field label="Actual crew cost">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={shiftDraft.cost}
                  onChange={(event) =>
                    setShiftDraft({
                      ...shiftDraft,
                      cost: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <div className="modal-actions">
              <Button>
                <Clock3 size={16} /> Schedule shift
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {cueDraft && (
        <Modal title="Run-of-show cue" onClose={() => setCueDraft(null)}>
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...cue } = {
                ...cueDraft,
                at: new Date(cueDraft.at).toISOString(),
              };
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({ ...record, cues: [...record.cues, cue] }),
                  ),
                }))
              ) {
                setCueDraft(null);
                toast("Run-of-show cue added.");
              }
            }}
          >
            <Field label="Event">
              <select
                value={cueDraft.eventId}
                onChange={(event) =>
                  setCueDraft({ ...cueDraft, eventId: event.target.value })
                }
              >
                {data.events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cue">
              <input
                required
                value={cueDraft.title}
                onChange={(event) =>
                  setCueDraft({ ...cueDraft, title: event.target.value })
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Time">
                <input
                  required
                  type="datetime-local"
                  value={cueDraft.at.slice(0, 16)}
                  onChange={(event) =>
                    setCueDraft({ ...cueDraft, at: event.target.value })
                  }
                />
              </Field>
              <Field label="Department">
                <input
                  required
                  value={cueDraft.department}
                  onChange={(event) =>
                    setCueDraft({ ...cueDraft, department: event.target.value })
                  }
                />
              </Field>
              <Field label="Owner">
                <input
                  required
                  value={cueDraft.owner}
                  onChange={(event) =>
                    setCueDraft({ ...cueDraft, owner: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Execution note">
              <textarea
                value={cueDraft.notes}
                onChange={(event) =>
                  setCueDraft({ ...cueDraft, notes: event.target.value })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Add cue</Button>
            </div>
          </form>
        </Modal>
      )}
      {transportDraft && (
        <Modal
          title="Transport assignment"
          onClose={() => setTransportDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...transport } = {
                ...transportDraft,
                departureAt: new Date(transportDraft.departureAt).toISOString(),
                arrivalAt: new Date(transportDraft.arrivalAt).toISOString(),
              };
              if (transport.arrivalAt <= transport.departureAt) {
                setOperationError("Arrival must be after departure.");
                return;
              }
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({
                      ...record,
                      transports: [...record.transports, transport],
                    }),
                  ),
                }))
              ) {
                setTransportDraft(null);
                setOperationError("");
                toast("Transport assignment added.");
              }
            }}
          >
            {operationError && <ErrorNote>{operationError}</ErrorNote>}
            <Field label="Event">
              <select
                value={transportDraft.eventId}
                onChange={(event) =>
                  setTransportDraft({
                    ...transportDraft,
                    eventId: event.target.value,
                  })
                }
              >
                {data.events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Direction">
                <select
                  value={transportDraft.kind}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      kind: event.target.value as "Outbound" | "Return",
                    })
                  }
                >
                  <option>Outbound</option>
                  <option>Return</option>
                </select>
              </Field>
              <Field label="Provider">
                <input
                  required
                  value={transportDraft.provider}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      provider: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Vehicle">
                <input
                  required
                  value={transportDraft.vehicle}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      vehicle: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Driver">
                <input
                  required
                  value={transportDraft.driver}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      driver: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Departure">
                <input
                  required
                  type="datetime-local"
                  value={transportDraft.departureAt.slice(0, 16)}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      departureAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Arrival">
                <input
                  required
                  type="datetime-local"
                  value={transportDraft.arrivalAt.slice(0, 16)}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      arrivalAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Actual cost">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={transportDraft.cost}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      cost: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                value={transportDraft.notes}
                onChange={(event) =>
                  setTransportDraft({
                    ...transportDraft,
                    notes: event.target.value,
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Add transport</Button>
            </div>
          </form>
        </Modal>
      )}
      {changeDraft && (
        <Modal
          title="Record onsite change"
          description="Saved entries are immutable production history."
          onClose={() => setChangeDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...change } = changeDraft;
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({
                      ...record,
                      changes: [...record.changes, change],
                    }),
                  ),
                  activity: [
                    activity("Onsite change recorded", change.title, eventId),
                    ...workspace.activity,
                  ],
                }))
              ) {
                setChangeDraft(null);
                toast("Onsite change preserved in the event log.");
              }
            }}
          >
            <Field label="Change title">
              <input
                required
                value={changeDraft.title}
                onChange={(event) =>
                  setChangeDraft({ ...changeDraft, title: event.target.value })
                }
              />
            </Field>
            <Field label="What changed">
              <textarea
                required
                value={changeDraft.detail}
                onChange={(event) =>
                  setChangeDraft({ ...changeDraft, detail: event.target.value })
                }
              />
            </Field>
            <Field label="Operational impact">
              <textarea
                required
                value={changeDraft.impact}
                onChange={(event) =>
                  setChangeDraft({ ...changeDraft, impact: event.target.value })
                }
              />
            </Field>
            <Field label="Estimated cost impact">
              <input
                type="number"
                min="0"
                step=".01"
                value={changeDraft.costImpact}
                onChange={(event) =>
                  setChangeDraft({
                    ...changeDraft,
                    costImpact: Number(event.target.value),
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Record change</Button>
            </div>
          </form>
        </Modal>
      )}
      {costDraft && (
        <Modal
          title="Record actual cost"
          description="Saved cost entries are immutable."
          onClose={() => setCostDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...cost } = costDraft;
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({ ...record, costs: [...record.costs, cost] }),
                  ),
                }))
              ) {
                setCostDraft(null);
                toast("Actual cost recorded.");
              }
            }}
          >
            <div className="form-grid">
              <Field label="Category">
                <select
                  value={costDraft.category}
                  onChange={(event) =>
                    setCostDraft({
                      ...costDraft,
                      category: event.target.value as ActualCost["category"],
                    })
                  }
                >
                  {[
                    "Crew",
                    "Transport",
                    "Supplier rental",
                    "Repair",
                    "Other",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Incurred date">
                <input
                  type="date"
                  required
                  value={costDraft.incurredAt}
                  onChange={(event) =>
                    setCostDraft({
                      ...costDraft,
                      incurredAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  required
                  value={costDraft.amount}
                  onChange={(event) =>
                    setCostDraft({
                      ...costDraft,
                      amount: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Description">
              <input
                required
                value={costDraft.description}
                onChange={(event) =>
                  setCostDraft({
                    ...costDraft,
                    description: event.target.value,
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Record cost</Button>
            </div>
          </form>
        </Modal>
      )}
      {draft && (
        <Modal title="Add a production task" onClose={() => setDraft(null)}>
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                !(await update((s) => ({
                  ...s,
                  tasks: [...s.tasks, draft],
                  activity: [
                    activity(
                      "Production task added",
                      draft.title,
                      draft.eventId,
                    ),
                    ...s.activity,
                  ],
                })))
              )
                return;
              setDraft(null);
              toast("Task assigned.");
            }}
          >
            <Field label="Task">
              <input
                required
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Event">
              <select
                required
                value={draft.eventId}
                onChange={(e) =>
                  setDraft({ ...draft, eventId: e.target.value })
                }
              >
                {data.events.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Assignee">
                {mode === "company" ? (
                  <select
                    required
                    value={draft.assigneeId || ""}
                    onChange={(e) => {
                      const member = members.find(
                        (person) => person.id === e.target.value,
                      );
                      if (member)
                        setDraft({
                          ...draft,
                          assigneeId: member.id,
                          assignee: member.name,
                          role: member.role,
                        });
                    }}
                  >
                    <option value="">
                      Selecciona una cuenta asignada al evento
                    </option>
                    {members.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={draft.assignee}
                    onChange={(e) =>
                      setDraft({ ...draft, assignee: e.target.value })
                    }
                  />
                )}
                {teamError && <span role="alert">{teamError}</span>}
              </Field>
              <Field label="Due date">
                <input
                  required
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="Phase">
                <select
                  value={draft.phase}
                  onChange={(e) =>
                    setDraft({ ...draft, phase: e.target.value })
                  }
                >
                  <option>Planning</option>
                  <option>Preparation</option>
                </select>
              </Field>
            </div>
            <div className="modal-actions">
              <Button>Add task</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Reports() {
  const { data, update, toast, user, mode } = useWorkspace();
  const dates = [
    ...data.events.flatMap((event) => [event.date, event.endDate]),
    ...data.reservations.flatMap((reservation) => [
      reservation.start,
      reservation.end,
    ]),
  ].sort();
  const [tab, setTab] = useState("Resumen");
  const [rangeStart, setRangeStart] = useState(
    dates[0] || new Date().toLocaleDateString("en-CA"),
  );
  const [rangeEnd, setRangeEnd] = useState(
    dates.at(-1) || new Date().toLocaleDateString("en-CA"),
  );
  const [failure, setFailure] = useState<{
    record: AutomationRecord;
    reason: string;
  } | null>(null);
  const canSeeCommercial =
    !user || ["Administrator", "Sales Manager"].includes(user.role);
  const canSeeCosts =
    !user || ["Administrator", "Production Manager"].includes(user.role);
  const canSeeProfitability = canSeeCommercial && canSeeCosts;
  const canManageAutomation = canEditCollection(user, "automations");
  const pipeline = canSeeCommercial ? pipelineReport(data) : [];
  const financials = canSeeProfitability ? financialReport(data) : [];
  const utilization = utilizationReport(data, rangeStart, rangeEnd);
  const workload = workloadReport(data);
  const performance = performanceReport(data);
  const quality = dataQualityReport(data);
  const current = currentProposals(data);
  const quotedTotal = pipeline.reduce((sum, row) => sum + row.value, 0);
  const acceptedTotal =
    pipeline.find((row) => row.status === "Accepted")?.value || 0;
  const actualTotal = financials.reduce((sum, row) => sum + row.actualCost, 0);
  const tabs = [
    "Resumen",
    ...(canSeeProfitability ? ["Contribución"] : []),
    "Utilización",
    "Carga de trabajo",
    "Ejecución",
    ...(canManageAutomation ? ["Automatización"] : []),
    "Definiciones",
  ];
  const evaluate = async () => {
    const existing = new Set(data.automations.map((record) => record.key));
    const generatedAt = new Date().toISOString();
    const additions = automationCandidates(data).filter(
      (candidate) => !existing.has(candidate.key),
    );
    if (!additions.length) {
      toast(
        "No hay sugerencias nuevas. Las reglas no duplicaron acciones existentes.",
      );
      return;
    }
    if (
      await update((workspace) => ({
        ...workspace,
        automations: [
          ...workspace.automations,
          ...additions.map((candidate) => ({
            ...candidate,
            id: id(),
            status: "Open" as const,
            createdAt: generatedAt,
          })),
        ],
        activity: [
          activity(
            "Automation rules evaluated",
            `${additions.length} suggestion(s) created for human review.`,
          ),
          ...workspace.activity,
        ],
      }))
    )
      toast(`${additions.length} sugerencias creadas para revisión.`);
  };
  const decide = async (
    record: AutomationRecord,
    status: "Approved" | "Dismissed",
  ) => {
    const taskId =
      status === "Approved" && record.action === "Create task"
        ? id()
        : undefined;
    const event = record.eventId
      ? data.events.find((item) => item.id === record.eventId)
      : undefined;
    if (record.action === "Create task" && status === "Approved" && !event)
      return;
    const ok = await update((workspace) => ({
      ...workspace,
      automations: workspace.automations.map((item) =>
        item.id === record.id ? { ...item, status, taskId } : item,
      ),
      tasks:
        taskId && event
          ? [
              ...workspace.tasks,
              {
                id: taskId,
                eventId: event.id,
                title: record.title,
                assignee: user?.name || event.manager || "Alex Morgan",
                ...(user ? { assigneeId: user.id } : {}),
                role: user?.role || "Production manager",
                date: record.dueAt.slice(0, 10),
                done: false,
                phase: "Preparation",
              },
            ]
          : workspace.tasks,
      activity: [
        activity(
          status === "Approved"
            ? "Automation action approved"
            : "Automation suggestion dismissed",
          record.title,
          record.eventId,
        ),
        ...workspace.activity,
      ],
    }));
    if (ok)
      toast(
        status === "Approved"
          ? taskId
            ? "Acción aprobada y tarea creada."
            : "Revisión aprobada sin ejecutar acciones externas."
          : "Sugerencia descartada y conservada en el historial.",
      );
  };
  const exportReport = () =>
    downloadFile(
      "kit-report.json",
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          source: mode === "company" ? "Company workspace" : "Sample workspace",
          range: { start: rangeStart, end: rangeEnd },
          definitions: metricDefinitions,
          ...(canSeeCommercial ? { pipeline } : {}),
          ...(canSeeProfitability ? { financials } : {}),
          utilization,
          workload,
          performance,
          dataQuality: quality,
        },
        null,
        2,
      ),
    );
  return (
    <>
      <PageHeader
        eyebrow="A CLEARER PICTURE"
        title="Reports"
        description="Métricas trazables con alcance, costos y permisos claramente separados."
        actions={
          <Button variant="secondary" onClick={exportReport}>
            <Download size={16} />
            Export summary
          </Button>
        }
      />
      <div className="directory-toolbar">
        <Tabs items={tabs} value={tab} onChange={setTab} />
        {tab === "Utilización" && (
          <div className="filter-row">
            <Field label="Desde">
              <input
                type="date"
                value={rangeStart}
                max={rangeEnd}
                onChange={(event) => setRangeStart(event.target.value)}
              />
            </Field>
            <Field label="Hasta">
              <input
                type="date"
                value={rangeEnd}
                min={rangeStart}
                onChange={(event) => setRangeEnd(event.target.value)}
              />
            </Field>
          </div>
        )}
      </div>
      {tab === "Resumen" && (
        <>
          <div className="stat-grid">
            {canSeeCommercial && (
              <Stat
                label="Alcance cotizado"
                value={money(quotedTotal)}
                detail={`${current.length} propuestas actuales · no es ingreso cobrado`}
                icon={<FileText size={18} />}
              />
            )}
            {canSeeProfitability && (
              <Stat
                label="Costos operativos reales"
                value={money(actualTotal)}
                detail="Personal, logística, proveedores, reparaciones y otros registros"
                icon={<Wrench size={18} />}
              />
            )}
            {canSeeCommercial && (
              <Stat
                label="Alcance aceptado"
                value={money(acceptedTotal)}
                detail="Ofertas confirmadas por propietario · no es efectivo cobrado"
                icon={<ShieldCheck size={18} />}
              />
            )}
            <Stat
              label="Eventos"
              value={data.events.length}
              detail="Todos los estados de producción"
              icon={<CalendarDays size={18} />}
            />
            <Stat
              label="Tareas completadas"
              value={`${data.tasks.filter((t) => t.done).length}/${data.tasks.length}`}
              detail="Lista actual de producción"
              icon={<Users size={18} />}
            />
          </div>
          <div className="detail-grid">
            {canSeeCommercial && (
              <Panel title="Flujo comercial actual">
                <div className="panel-body chart-bars">
                  {pipeline.map((row) => {
                    const max = Math.max(
                      1,
                      ...pipeline.map((item) => item.count),
                    );
                    return (
                      <div key={row.status}>
                        <div>
                          <span>{row.status}</span>
                          <strong>
                            {row.count} · {money(row.value)}
                          </strong>
                        </div>
                        <span className="bar-track">
                          <i
                            style={{
                              width: `${(row.count / max) * 100}%`,
                            }}
                          />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
            )}
            <Panel title="Calidad y cobertura de datos">
              <div className="panel-body">
                {quality.map((issue) => (
                  <div className="simple-row" key={issue.key}>
                    <ListChecks size={19} />
                    <span>{issue.message}</span>
                    {issue.eventId && (
                      <Link
                        className="text-link"
                        to={`/events/${issue.eventId}`}
                      >
                        Revisar
                      </Link>
                    )}
                  </div>
                ))}
                {quality.length === 0 && (
                  <Empty
                    title="Cobertura completa"
                    description="No se detectaron brechas con las reglas actuales."
                  />
                )}
              </div>
            </Panel>
          </div>
          <div className="info-note">
            Cada cifra identifica su fuente. Las cotizaciones no se presentan
            como ingresos cobrados y la contribución no sustituye la
            contabilidad.
          </div>
        </>
      )}
      {tab === "Contribución" && canSeeProfitability && (
        <Panel
          title="Contribución operativa por evento"
          subtitle="Alcance aceptado menos costos operativos registrados. No es utilidad contable."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Evento / alcance</th>
                  <th>Aceptado</th>
                  <th>Costo real</th>
                  <th>Contribución</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                {financials.map((row) => (
                  <tr key={row.eventId}>
                    <td>
                      <strong>{row.eventName}</strong>
                      <small>{row.scopeStatus}</small>
                    </td>
                    <td>
                      {row.acceptedProposal ? money(row.acceptedValue) : "—"}
                    </td>
                    <td>{money(row.actualCost)}</td>
                    <td>
                      {row.acceptedProposal ? money(row.contribution) : "—"}
                    </td>
                    <td>
                      <Badge tone={row.contribution >= 0 ? "green" : "red"}>
                        {row.marginPercent === undefined
                          ? "Sin alcance"
                          : `${row.marginPercent.toFixed(1)}%`}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === "Utilización" && (
        <Panel
          title="Utilización de equipos"
          subtitle="Capacidad actual disponible y unidades-día reservadas dentro del periodo seleccionado."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipo</th>
                  <th>Capacidad · unidades-día</th>
                  <th>Comprometido</th>
                  <th>Reservas provisionales</th>
                  <th>Utilización</th>
                </tr>
              </thead>
              <tbody>
                {utilization.map((row) => (
                  <tr key={row.equipmentId}>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>{row.capacityUnitDays}</td>
                    <td>{row.committedUnitDays}</td>
                    <td>{row.holdUnitDays}</td>
                    <td>
                      <Badge
                        tone={
                          (row.utilizationPercent || 0) > 100
                            ? "red"
                            : (row.utilizationPercent || 0) > 70
                              ? "amber"
                              : "green"
                        }
                      >
                        {row.utilizationPercent === undefined
                          ? "Sin capacidad"
                          : `${row.utilizationPercent.toFixed(1)}%`}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === "Carga de trabajo" && (
        <Panel
          title="Carga por persona"
          subtitle="Tareas y horas de turnos registradas; no es nómina."
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Persona</th>
                  <th>Tareas abiertas</th>
                  <th>Tareas completadas</th>
                  <th>Horas programadas</th>
                  <th>Horas completadas</th>
                </tr>
              </thead>
              <tbody>
                {workload.map((row) => (
                  <tr key={row.person}>
                    <td>
                      <strong>{row.person}</strong>
                    </td>
                    <td>{row.openTasks}</td>
                    <td>{row.completedTasks}</td>
                    <td>{row.scheduledHours.toFixed(1)}</td>
                    <td>{row.completedHours.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {tab === "Ejecución" && (
        <Panel
          title="Ejecución por evento"
          subtitle="Progreso de los registros que existen: tareas, cues, transporte y devoluciones."
        >
          <div className="panel-body">
            {performance.map((row) => (
              <div className="simple-row" key={row.eventId}>
                <ChartNoAxesCombined size={20} />
                <div>
                  <strong>{row.eventName}</strong>
                  <small>
                    {row.completed}/{row.total} elementos completos ·{" "}
                    {row.onsiteChanges} cambios en sitio
                  </small>
                </div>
                <Badge>{row.status}</Badge>
                <strong>
                  {row.completionPercent === undefined
                    ? "Sin datos"
                    : `${row.completionPercent.toFixed(0)}%`}
                </strong>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {tab === "Automatización" && canManageAutomation && (
        <Panel
          title="Sugerencias de automatización"
          subtitle="Las reglas solo crean sugerencias. Una persona debe aprobar cada acción interna."
        >
          <div className="panel-body">
            <div className="section-heading">
              <div>
                <h2>Revisión humana obligatoria</h2>
                <p>
                  No se envían mensajes, no se aceptan propuestas y no se
                  contactan integraciones.
                </p>
              </div>
              <Button onClick={() => void evaluate()}>
                <RefreshCcw size={16} /> Evaluar reglas
              </Button>
            </div>
            {[...data.automations]
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .map((record) => (
                <div className="simple-row" key={record.id}>
                  <Gauge size={20} />
                  <div>
                    <strong>{record.title}</strong>
                    <small>{record.detail}</small>
                    <small>
                      Vence {shortDate(record.dueAt)} ·{" "}
                      {record.action === "Create task"
                        ? "creará una tarea interna"
                        : "solo registra la revisión"}
                    </small>
                    {record.failureReason && (
                      <small role="alert">Error: {record.failureReason}</small>
                    )}
                  </div>
                  <Badge>
                    {
                      {
                        Open: "Abierta",
                        Approved: "Aprobada",
                        Dismissed: "Descartada",
                        Failed: "Fallida",
                      }[record.status]
                    }
                  </Badge>
                  {record.status === "Open" && (
                    <>
                      <Button onClick={() => void decide(record, "Approved")}>
                        Aprobar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => void decide(record, "Dismissed")}
                      >
                        Descartar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setFailure({ record, reason: "" })}
                      >
                        Registrar error
                      </Button>
                    </>
                  )}
                </div>
              ))}
            {data.automations.length === 0 && (
              <Empty
                title="Sin sugerencias evaluadas"
                description="Evalúa las reglas para crear una cola revisable sin ejecutar acciones."
              />
            )}
          </div>
        </Panel>
      )}
      {tab === "Definiciones" && (
        <Panel
          title="Diccionario de métricas"
          subtitle="Estas fórmulas acompañan el informe y su exportación."
        >
          <div className="panel-body">
            {metricDefinitions.map((definition) => (
              <div className="simple-row" key={definition.name}>
                <CircleDollarSign size={20} />
                <div>
                  <strong>{definition.name}</strong>
                  <small>{definition.formula}</small>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
      {failure && (
        <Modal
          title="Registrar fallo de automatización"
          onClose={() => setFailure(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!failure.reason.trim()) return;
              if (
                await update((workspace) => ({
                  ...workspace,
                  automations: workspace.automations.map((item) =>
                    item.id === failure.record.id
                      ? {
                          ...item,
                          status: "Failed",
                          failureReason: failure.reason.trim(),
                        }
                      : item,
                  ),
                  activity: [
                    activity(
                      "Automation action failed",
                      failure.record.title,
                      failure.record.eventId,
                    ),
                    ...workspace.activity,
                  ],
                }))
              ) {
                setFailure(null);
                toast("Fallo registrado para seguimiento.");
              }
            }}
          >
            <Field label="Motivo del fallo">
              <textarea
                required
                value={failure.reason}
                onChange={(event) =>
                  setFailure({ ...failure, reason: event.target.value })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button variant="danger">Registrar fallo</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Creative() {
  const { data, update, toast, user, saving } = useWorkspace();
  const [params] = useSearchParams();
  const [tab, setTab] = useState("Concepts & media");
  const [eventId, setEventId] = useState(
    params.get("event") || data.events[0]?.id || "",
  );
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<CreativeKind | "Event video">(
    "Event concept",
  );
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [revisionParentId, setRevisionParentId] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const assets = data.creativeAssets
    .filter((asset) => asset.eventId === eventId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const references = data.brandAssets.filter(
    (reference) => reference.eventId === eventId,
  );
  const selectedAsset = data.creativeAssets.find(
    (asset) => asset.id === selectedAssetId,
  );
  const draftProposals = data.proposals.filter(
    (proposal) => proposal.eventId === eventId && proposal.status === "Draft",
  );
  const generationLimit = 20;
  const canCreate = canEditCollection(user, "creativeAssets");
  const canAttach = canEditCollection(user, "proposals");

  const generate = async () => {
    const cleanBrief = brief.trim();
    if (kind === "Event video") {
      setGenerationError(
        "Video remains gated until its provider, usage policy, and cost limit are approved.",
      );
      return;
    }
    if (cleanBrief.length < 20) {
      setGenerationError(
        "Add at least 20 characters of creative direction. Your brief has been preserved.",
      );
      return;
    }
    if (assets.length >= generationLimit) {
      setGenerationError(
        "This event has reached the local showcase limit. Your brief has been preserved.",
      );
      return;
    }
    if (kind === "Image edit" && referenceIds.length === 0) {
      setGenerationError(
        "Select at least one authorized reference for an image edit. Your brief has been preserved.",
      );
      return;
    }
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return;
    const parent = revisionParentId
      ? data.creativeAssets.find((asset) => asset.id === revisionParentId)
      : undefined;
    const now = new Date().toISOString();
    const next = createShowcaseCreativeAsset({
      id: id(),
      eventId,
      eventName: event.name,
      kind,
      brief: cleanBrief,
      referenceIds,
      referenceNames: references
        .filter((reference) => referenceIds.includes(reference.id))
        .map((reference) => reference.name),
      referenceDataUrls: references
        .filter((reference) => referenceIds.includes(reference.id))
        .map((reference) => reference.dataUrl),
      generatedAt: now,
      parent,
    });
    if (
      await update((workspace) => ({
        ...workspace,
        creativeAssets: [...workspace.creativeAssets, next],
        activity: [
          activity(
            "Creative concept generated",
            `${next.title}, revision ${next.revision}, is awaiting review.`,
            eventId,
          ),
          ...workspace.activity,
        ],
      }))
    ) {
      setSelectedAssetId(next.id);
      setRevisionParentId("");
      setGenerationError("");
      toast("Concepto local creado y enviado a revisión.");
    }
  };

  const review = async (status: "Approved" | "Rejected") => {
    if (!selectedAsset || selectedAsset.status !== "In review") return;
    const reviewedAt = new Date().toISOString();
    if (
      await update((workspace) => ({
        ...workspace,
        creativeAssets: workspace.creativeAssets.map((asset) =>
          asset.id === selectedAsset.id
            ? { ...asset, status, reviewedAt }
            : asset,
        ),
        activity: [
          activity(
            status === "Approved"
              ? "Creative concept approved"
              : "Creative concept rejected",
            `${selectedAsset.title}, revision ${selectedAsset.revision}.`,
            selectedAsset.eventId,
          ),
          ...workspace.activity,
        ],
      }))
    )
      toast(
        status === "Approved"
          ? "Concepto aprobado para propuestas."
          : "Concepto rechazado y conservado en el historial.",
      );
  };

  const uploadReference = async (file?: File) => {
    if (!file) return;
    if (!rightsConfirmed) {
      toast("Confirma los derechos de uso antes de cargar el archivo.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast("Usa una imagen PNG, JPEG o WebP.");
      return;
    }
    if (file.size > 800_000) {
      toast("La referencia debe pesar 800 KB o menos.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("The reference could not be read."));
      reader.readAsDataURL(file);
    });
    const reference = {
      id: id(),
      eventId,
      name: file.name,
      mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
      dataUrl,
      rightsConfirmed: true as const,
      createdAt: new Date().toISOString(),
    };
    if (
      await update((workspace) => ({
        ...workspace,
        brandAssets: [...workspace.brandAssets, reference],
      }))
    ) {
      setReferenceIds((current) => [...current, reference.id]);
      toast("Referencia autorizada guardada.");
    }
  };

  const attachToProposal = async (proposalId: string) => {
    if (!selectedAsset || selectedAsset.status !== "Approved") return;
    if (
      await update((workspace) => ({
        ...workspace,
        proposals: workspace.proposals.map((proposal) =>
          proposal.id === proposalId
            ? {
                ...proposal,
                creativeAssetIds: [
                  ...new Set([
                    ...(proposal.creativeAssetIds || []),
                    selectedAsset.id,
                  ]),
                ],
              }
            : proposal,
        ),
        activity: [
          activity(
            "Creative concept attached",
            `${selectedAsset.title}, revision ${selectedAsset.revision}, was attached to a draft proposal.`,
            selectedAsset.eventId,
          ),
          ...workspace.activity,
        ],
      }))
    )
      toast("Concepto adjuntado a la propuesta borrador.");
  };

  return (
    <>
      <PageHeader
        eyebrow="IMAGINE THE EXPERIENCE"
        title="AI Creative Studio"
        description="A space for concepts, visual direction, and the details that make it yours."
        actions={<Badge tone="neutral">Local showcase · no API cost</Badge>}
      />
      <Tabs
        items={["Concepts & media", "Brand assets", "Selected for proposals"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Concepts & media" ? (
        <div className="creative-workspace">
          <Panel title="Your creative brief">
            <div className="panel-body">
              <Field label="Connected event">
                <select
                  value={eventId}
                  onChange={(e) => {
                    setEventId(e.target.value);
                    setSelectedAssetId("");
                    setReferenceIds([]);
                    setRevisionParentId("");
                  }}
                >
                  {data.events.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What are we creating?">
                <select
                  value={kind}
                  onChange={(e) =>
                    setKind(e.target.value as CreativeKind | "Event video")
                  }
                >
                  {[
                    ["Event concept", "Concepto del evento"],
                    ["Stage concept", "Concepto de escenario"],
                    ["Lighting concept", "Concepto de iluminación"],
                    ["Promotional visual", "Visual promocional"],
                    ["Image edit", "Edición de imagen"],
                    ["Event video", "Video del evento"],
                  ].map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Creative direction">
                <textarea
                  rows={7}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="The mood, the palette, the audience. Tell us what you have in mind…"
                />
              </Field>
              {references.length > 0 && (
                <fieldset className="creative-reference-picker">
                  <legend>Authorized references</legend>
                  {references.map((reference) => (
                    <label key={reference.id}>
                      <input
                        type="checkbox"
                        checked={referenceIds.includes(reference.id)}
                        onChange={(e) =>
                          setReferenceIds((current) =>
                            e.target.checked
                              ? [...current, reference.id]
                              : current.filter((item) => item !== reference.id),
                          )
                        }
                      />
                      {reference.name}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="connection-note">
                <Sparkles size={20} />
                <div>
                  <strong>Local concept generator</strong>
                  <p>
                    Creates a labeled SVG concept without contacting an external
                    service. Replace this boundary after a provider and budget
                    are approved.
                  </p>
                </div>
              </div>
              {revisionParentId && (
                <div className="info-note">
                  La próxima generación será una revisión del concepto
                  seleccionado.
                </div>
              )}
              {kind === "Event video" && (
                <div className="info-note">
                  El video está aplazado y no consume unidades. La descripción
                  permanece guardada en este formulario.
                </div>
              )}
              {generationError && (
                <div className="error-note" role="alert">
                  {generationError}
                </div>
              )}
              <div className="creative-actions">
                <Button
                  disabled={
                    !canCreate ||
                    saving ||
                    kind === "Event video" ||
                    assets.length >= generationLimit
                  }
                  onClick={() => void generate()}
                >
                  <WandSparkles size={16} />
                  Generar concepto local
                </Button>
                <Button
                  variant="secondary"
                  disabled={!brief.trim()}
                  onClick={() => {
                    downloadFile(
                      "creative-brief.txt",
                      `Event: ${data.events.find((e) => e.id === eventId)?.name}\nType: ${kind}\n\n${brief}`,
                      "text/plain",
                    );
                    toast("Creative brief exported.");
                  }}
                >
                  <Download size={16} />
                  Export creative brief
                </Button>
              </div>
              <small className="creative-usage">
                Uso local: {assets.length}/{generationLimit} conceptos · costo
                estimado: $0.00 · ninguna API externa
              </small>
            </div>
          </Panel>
          <section className="creative-gallery" aria-label="Concept gallery">
            {assets.length === 0 ? (
              <div className="creative-canvas">
                <span className="creative-orbit orbit-one" />
                <span className="creative-orbit orbit-two" />
                <span className="creative-orbit orbit-three" />
                <div>
                  <WandSparkles size={36} />
                  <h2>It starts with an idea.</h2>
                  <p>
                    Your generated concepts will live here, ready for review,
                    refinement, and your next proposal.
                  </p>
                  <div className="creative-tags">
                    <span>
                      <Image size={14} />
                      Images
                    </span>
                    <span>
                      <Sparkles size={14} />
                      Concepts
                    </span>
                    <span>
                      <Video size={14} />
                      Video deferred
                    </span>
                  </div>
                </div>
                <small>
                  Creative visuals are separate from dimensioned production
                  designs.
                </small>
              </div>
            ) : (
              <>
                <div className="creative-gallery-grid">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      className={`creative-card ${selectedAssetId === asset.id ? "selected" : ""}`}
                      onClick={() => setSelectedAssetId(asset.id)}
                      aria-label={`Seleccionar ${asset.title}, revisión ${asset.revision}`}
                    >
                      <img src={asset.dataUrl} alt="" />
                      <span>
                        <strong>{asset.title}</strong>
                        <small>
                          Rev. {asset.revision} · {asset.status}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {selectedAsset && (
                  <Panel
                    title={selectedAsset.title}
                    subtitle={`Revisión ${selectedAsset.revision} · ${selectedAsset.provider} / ${selectedAsset.model}`}
                  >
                    <div className="creative-review panel-body">
                      <img
                        src={selectedAsset.dataUrl}
                        alt={selectedAsset.title}
                      />
                      <div className="creative-provenance">
                        <Badge>{selectedAsset.status}</Badge>
                        <strong>CONCEPTO GENERADO · DEMOSTRACIÓN LOCAL</strong>
                        <p>{selectedAsset.brief}</p>
                        <small>
                          {selectedAsset.referenceIds.length} referencia(s) · 1
                          unidad · $0.00 ·{" "}
                          {new Date(selectedAsset.generatedAt).toLocaleString()}
                        </small>
                      </div>
                      <div className="creative-actions">
                        {selectedAsset.status === "In review" && canCreate && (
                          <>
                            <Button onClick={() => void review("Approved")}>
                              Aprobar concepto
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => void review("Rejected")}
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setBrief(selectedAsset.brief);
                            setKind(selectedAsset.kind);
                            setReferenceIds(selectedAsset.referenceIds);
                            setRevisionParentId(selectedAsset.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Crear revisión
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            downloadFile(
                              `creative-${selectedAsset.id}-r${selectedAsset.revision}.svg`,
                              decodeURIComponent(
                                selectedAsset.dataUrl.split(",")[1],
                              ),
                              "image/svg+xml",
                            )
                          }
                        >
                          <Download size={16} />
                          Descargar
                        </Button>
                      </div>
                      {selectedAsset.status === "Approved" && (
                        <div className="creative-attach">
                          <Field label="Attach to draft proposal">
                            <select
                              defaultValue=""
                              disabled={
                                !canAttach || draftProposals.length === 0
                              }
                              onChange={(e) => {
                                if (e.target.value)
                                  void attachToProposal(e.target.value);
                                e.target.value = "";
                              }}
                            >
                              <option value="">Seleccionar propuesta…</option>
                              {draftProposals.map((proposal) => (
                                <option value={proposal.id} key={proposal.id}>
                                  {proposal.number} · v{proposal.version}
                                </option>
                              ))}
                            </select>
                          </Field>
                          {draftProposals.length === 0 && (
                            <small>
                              No hay una propuesta borrador para este evento.
                            </small>
                          )}
                        </div>
                      )}
                    </div>
                  </Panel>
                )}
              </>
            )}
          </section>
        </div>
      ) : tab === "Brand assets" ? (
        <div className="creative-library">
          <Panel
            title="Authorized brand references"
            subtitle="PNG, JPEG or WebP · maximum 800 KB per file"
          >
            <div className="panel-body">
              <Field label="Connected event">
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  {data.events.map((event) => (
                    <option value={event.id} key={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(e) => setRightsConfirmed(e.target.checked)}
                />
                Confirmo que la empresa tiene derecho a usar esta referencia.
              </label>
              <input
                type="file"
                aria-label="Cargar referencia de marca"
                accept="image/png,image/jpeg,image/webp"
                disabled={!canEditCollection(user, "brandAssets") || saving}
                onChange={(e) => {
                  void uploadReference(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </Panel>
          <div className="creative-reference-grid">
            {references.map((reference) => (
              <figure key={reference.id}>
                <img src={reference.dataUrl} alt={reference.name} />
                <figcaption>
                  <strong>{reference.name}</strong>
                  <small>
                    Derechos confirmados · {shortDate(reference.createdAt)}
                  </small>
                </figcaption>
              </figure>
            ))}
            {references.length === 0 && (
              <Empty
                title="Every brand has a story"
                description="Upload an authorized visual reference for this event."
              />
            )}
          </div>
        </div>
      ) : (
        <div className="creative-selected-list">
          {data.proposals
            .filter((proposal) => proposal.creativeAssetIds?.length)
            .map((proposal) => (
              <Panel
                key={proposal.id}
                title={`${proposal.number} · v${proposal.version}`}
                subtitle={
                  data.events.find((event) => event.id === proposal.eventId)
                    ?.name
                }
              >
                <div className="creative-gallery-grid panel-body">
                  {(proposal.creativeAssetIds || []).map((assetId) => {
                    const asset = data.creativeAssets.find(
                      (item) => item.id === assetId,
                    );
                    return asset ? (
                      <div className="creative-card" key={asset.id}>
                        <img src={asset.dataUrl} alt={asset.title} />
                        <span>
                          <strong>{asset.title}</strong>
                          <small>Rev. {asset.revision}</small>
                        </span>
                      </div>
                    ) : null;
                  })}
                </div>
              </Panel>
            ))}
          {!data.proposals.some(
            (proposal) => proposal.creativeAssetIds?.length,
          ) && (
            <Empty
              title="Only your best work goes forward"
              description="Approved concepts attached to draft proposals will appear here."
            />
          )}
        </div>
      )}
    </>
  );
}
export function SettingsPage() {
  const { data, update, toast, reset, mode, user, request } = useWorkspace();
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    if (mode === "company" && user?.role === "Administrator")
      request<{ configured: boolean }>("/ai/status")
        .then((result) => {
          if (active) setAiConfigured(result.configured);
        })
        .catch(() => {
          if (active) setAiConfigured(null);
        });
    return () => {
      active = false;
    };
  }, [mode, user?.role, request]);
  const [tab, setTab] = useState("Company profile");
  const [settings, setSettings] = useState({ ...data.settings });
  const [resetting, setResetting] = useState(false);
  if (mode === "company" && user?.role !== "Administrator")
    return (
      <>
        <PageHeader title="Mi cuenta" />
        <UserManagement />
      </>
    );
  return (
    <>
      <PageHeader
        eyebrow="MAKE THE WORKSPACE YOURS"
        title="Settings"
        description="Your company, your preferences, and the way your team works."
      />
      <div className="settings-workspace">
        <aside className="settings-nav">
          {[
            "Company profile",
            "Users & roles",
            "Proposal preferences",
            "Event preferences",
            "Notifications",
            "AI preferences",
            "Integrations",
            "Activity history",
            "Workspace data",
          ].map((item) => (
            <button
              key={item}
              className={item === tab ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </aside>
        <div>
          {tab === "Company profile" && (
            <Panel
              title="Company profile"
              subtitle="The identity shown across your workspace."
            >
              <form
                className="panel-body"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!(await update((s) => ({ ...s, settings })))) return;
                  toast("Company preferences saved.");
                }}
              >
                <div className="company-monogram">
                  {initials(settings.company)}
                </div>
                <Field label="Company name">
                  <input
                    required
                    value={settings.company}
                    onChange={(e) =>
                      setSettings({ ...settings, company: e.target.value })
                    }
                  />
                </Field>
                <Field label="Company email">
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) =>
                      setSettings({ ...settings, email: e.target.value })
                    }
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Currency">
                    <select value={settings.currency} disabled>
                      <option>USD</option>
                    </select>
                  </Field>
                  <Field label="Default event time zone">
                    <select
                      value={settings.timezone}
                      onChange={(e) =>
                        setSettings({ ...settings, timezone: e.target.value })
                      }
                    >
                      {[
                        "America/Puerto_Rico",
                        "America/New_York",
                        "America/Chicago",
                        "America/Los_Angeles",
                        "UTC",
                      ].map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Button>
                  <Save size={16} />
                  Save company profile
                </Button>
              </form>
            </Panel>
          )}
          {tab === "Users & roles" && mode === "company" && <UserManagement />}
          {tab === "Users & roles" && mode === "sample" && (
            <Panel
              title="Users & roles"
              subtitle="The permission model is defined; authentication is not connected in this local workspace."
            >
              <div className="panel-body">
                <div className="info-note">
                  You are previewing the owner workspace with sample data. These
                  role descriptions do not enforce access controls yet.
                </div>
                {[
                  [
                    "Administrator / owner",
                    "Company administration, outgoing message confirmation, and final acceptance review.",
                  ],
                  [
                    "Sales Manager",
                    "Clients, opportunities, editable proposals, and message drafts.",
                  ],
                  [
                    "Event Designer",
                    "Venue layouts, design revisions, and creative assets.",
                  ],
                  [
                    "Production Manager",
                    "Crew, equipment reservations, production tasks, and fulfillment.",
                  ],
                  [
                    "Technician",
                    "Assigned tasks, published plans, and equipment custody updates.",
                  ],
                  [
                    "Client / Guest",
                    "Only explicitly shared proposal revisions and event information.",
                  ],
                ].map(([name, description]) => (
                  <div className="role-row" key={name}>
                    <ShieldCheck size={20} />
                    <div>
                      <strong>{name}</strong>
                      <p>{description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "Integrations" && (
            <Panel
              title="Connections"
              subtitle="Services connect here when credentials and business policies are ready."
            >
              <div className="panel-body">
                {[
                  [
                    "WhatsApp / Meta",
                    "Inbound and outbound client messages, with owner approval before every send.",
                  ],
                  [
                    "Redacción de propuestas con IA",
                    "Sugerencias editables con equipos y tarifas del catálogo. El asistente general se conecta por separado.",
                  ],
                  [
                    "Creative generation",
                    "Images, editing, and later video generation.",
                  ],
                  [
                    "Cuentas y registros de empresa",
                    "Acceso por rol y registros compartidos en el servidor. Los archivos adjuntos se incorporarán después.",
                  ],
                ].map(([name, description]) => (
                  <div className="integration-row" key={name}>
                    <span className="integration-icon">
                      <Box size={22} />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <p>{description}</p>
                    </div>
                    <Badge tone="neutral">
                      {name === "Cuentas y registros de empresa" &&
                      mode === "company"
                        ? "Conectado"
                        : name === "Redacción de propuestas con IA" &&
                            mode === "company"
                          ? aiConfigured === null
                            ? "Estado no disponible"
                            : aiConfigured
                              ? "Configurada · pendiente de prueba en vivo"
                              : "Sin configurar"
                          : "Sin conectar"}
                    </Badge>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "Activity history" && (
            <Panel
              title="Workspace activity"
              subtitle={
                mode === "sample"
                  ? "Historial de ejemplo en este dispositivo."
                  : "Historial registrado por el servidor; los clientes no pueden modificarlo."
              }
            >
              <div className="activity-list">
                {data.activity.map((a) => (
                  <div className="activity-row" key={a.id}>
                    <span className="activity-dot" />
                    <div>
                      <strong>{a.title}</strong>
                      <p>{a.detail}</p>
                      <small>{new Date(a.at).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "Notifications" && (
            <Panel title="Notification preferences">
              <div className="panel-body">
                <label className="toggle-row">
                  <div>
                    <strong>Workspace reminders</strong>
                    <p>
                      Preference saved for the future notification service.
                      Acceptance requests remain visible in the inbox.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={data.settings.notifications}
                    onChange={async (e) => {
                      if (
                        !(await update((s) => ({
                          ...s,
                          settings: {
                            ...s.settings,
                            notifications: e.target.checked,
                          },
                        })))
                      )
                        return;
                      toast("Notification preference saved.");
                    }}
                  />
                </label>
                <Placeholder
                  title="Owner acceptance review"
                  description="The owner reviews each client acceptance notification before the offer is marked accepted."
                />
              </div>
            </Panel>
          )}
          {tab === "AI preferences" && (
            <Panel title="AI controls">
              <div className="panel-body">
                <div className="role-row">
                  <ShieldCheck size={23} />
                  <div>
                    <strong>Owner confirms every outgoing message</strong>
                    <p>
                      No autonomous replies, price negotiations, or acceptance
                      decisions.
                    </p>
                  </div>
                  <Badge>Required</Badge>
                </div>
                <Placeholder
                  title="Model, usage limits, and permitted context"
                  description="These settings will be available when an AI service is connected."
                />
              </div>
            </Panel>
          )}
          {tab === "Proposal preferences" && (
            <Panel title="Commercial defaults">
              <div className="panel-body">
                <p>
                  Daily rental rates come from the equipment catalog and are
                  copied into each proposal revision. Discounts apply before
                  tax. All amounts currently use USD.
                </p>
                <div className="info-note">
                  This calculation convention is provisional. Confirm rental
                  periods, rounding, tax treatment, deposits, and validity with
                  the business before live use.
                </div>
                <Placeholder
                  title="Branded templates and commercial terms"
                  description="Company-wide template editing will follow the core proposal workflow."
                />
              </div>
            </Panel>
          )}
          {tab === "Event preferences" && (
            <Panel title="Event defaults">
              <div className="panel-body">
                <div className="detail-facts">
                  <div>
                    <span>Default time zone</span>
                    <strong>{data.settings.timezone}</strong>
                  </div>
                  <div>
                    <span>Design units</span>
                    <strong>Meters · initial workspace</strong>
                  </div>
                  <div>
                    <span>Starting status</span>
                    <strong>Planning</strong>
                  </div>
                </div>
                <Placeholder
                  title="Custom event types and transition rules"
                  description="Further configuration will follow validation of the production workflow."
                />
              </div>
            </Panel>
          )}
          {tab === "Workspace data" && mode === "company" && (
            <Panel title="Datos de la empresa">
              <div className="panel-body">
                <p>
                  Los registros se guardan en el servidor. Esta exportación
                  contiene datos comerciales; guárdala en un lugar apropiado.
                </p>
                <Button
                  onClick={async () => {
                    try {
                      const exported = await request("/export");
                      downloadFile(
                        "kit-company-export.json",
                        JSON.stringify(exported, null, 2),
                      );
                    } catch (e) {
                      toast((e as Error).message);
                    }
                  }}
                >
                  Exportar registros de empresa
                </Button>
              </div>
            </Panel>
          )}
          {tab === "Workspace data" && mode === "sample" && (
            <Panel title="Your local workspace">
              <div className="panel-body">
                <p>
                  This preview saves changes in this browser on this device. It
                  does not provide shared cloud storage, authentication, or a
                  production backup service.
                </p>
                <Button
                  variant="secondary"
                  onClick={() =>
                    downloadFile(
                      "kit-workspace-backup.json",
                      JSON.stringify(data, null, 2),
                    )
                  }
                >
                  <Download size={16} />
                  Export local backup
                </Button>
                <hr />
                <h3>Restore sample workspace</h3>
                <p>
                  Replace local edits with the original illustrative clients,
                  events, and proposals.
                </p>
                <Button variant="danger" onClick={() => setResetting(true)}>
                  Restore sample data
                </Button>
              </div>
            </Panel>
          )}
        </div>
      </div>
      {resetting && (
        <Modal
          title="Restore sample data?"
          description="This replaces changes saved in this browser. Export a backup first if you want to keep them."
          onClose={() => setResetting(false)}
        >
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setResetting(false)}>
              Keep my changes
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                reset();
                setSettings({ ...data.settings });
                setResetting(false);
              }}
            >
              Replace with sample data
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
