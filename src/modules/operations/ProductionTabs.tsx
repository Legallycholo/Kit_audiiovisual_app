import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  Box,
  Bus,
  CalendarDays,
  Plus,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";
import { activity } from "../../shared/store";
import { Avatar, Badge, Button, Empty, Panel } from "../../shared/ui";
import {
  actualEventCosts,
  id,
  initials,
  money,
  productionReadiness,
  quoteTotals,
  shortDate,
} from "../../shared/domain";
import { canEditCollection } from "../../shared/access";
import type { EventStatus, Task } from "../../shared/types";
import { changeOperations, dateTimeLabel } from "./helpers";
import type { ProductionView } from "./production-view";
import { uiLabel } from "../../shared/i18n";

export function ProductionTabs({ ctx }: { ctx: ProductionView }) {
  const {
    data,
    update,
    user,
    eventFilter,
    tab,
    setShiftDraft,
    setCueDraft,
    setTransportDraft,
    setChangeDraft,
    setCostDraft,
    tasks,
    crew,
    readinessEvents,
    canManageProduction,
    selectedEventId,
    visibleOperations,
    changeProductionStatus,
  } = ctx;
  return (
    <>
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
                  <h2>{uiLabel(column)}</h2>
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
    </>
  );
}
