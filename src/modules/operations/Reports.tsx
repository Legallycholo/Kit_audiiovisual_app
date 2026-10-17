import { useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChartNoAxesCombined,
  CircleDollarSign,
  Download,
  FileText,
  RefreshCcw,
  ShieldCheck,
  Users,
  Gauge,
  ListChecks,
  Wrench,
} from "lucide-react";
import { useWorkspace, activity } from "../../shared/store";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeader,
  Panel,
  Stat,
  Tabs,
} from "../../shared/ui";
import { downloadFile, id, money, shortDate } from "../../shared/domain";
import { canEditCollection } from "../../shared/access";
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
} from "../../shared/reporting";
import type { AutomationRecord } from "../../shared/types";

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
