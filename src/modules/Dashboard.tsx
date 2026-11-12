import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  Clock3,
  FilePlus2,
  FileText,
  Layers3,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../shared/store";
import { Avatar, Badge, PageHeader, Panel, Stat, TextLink } from "../shared/ui";
import { canEditCollection, canSeeModule } from "../shared/access";
import { money, shortDate } from "../shared/domain";
import { pipelineReport } from "../shared/reporting";
import { activityLabel, uiLabel } from "../shared/i18n";

/**
 * What a scoped account can open. Administrators get the full picture in
 * /admin, so this only appears for the other roles.
 */
function YourAccess() {
  const { user } = useWorkspace();
  if (!user || user.role === "Administrator") return null;
  const sections = Object.entries({
    "/": "Inicio",
    "/events": "Eventos",
    "/proposals": "Propuestas",
    "/clients": "Clientes",
    "/venues": "Lugares",
    "/design": "Diseño",
    "/inventory": "Equipos",
    "/production": "Producción",
    "/inbox": "Mensajes",
    "/reports": "Informes",
  })
    .filter(([path]) => canSeeModule(user, path))
    .map(([, label]) => label);
  return (
    <Panel
      title="Your access"
      subtitle="The role you signed in with and what it opens."
    >
      <div className="panel-body">
        <div className="role-row">
          <ShieldCheck size={21} aria-hidden="true" />
          <div>
            <strong>{user.name || user.email}</strong>
            <p>
              {uiLabel("Your role")}: {uiLabel(user.role)}
            </p>
            <small>
              {uiLabel("Sections")}: {sections.join(", ") || "—"}
            </small>
          </div>
          <Badge tone="neutral">
            {user.role === "Sales Manager"
              ? uiLabel("All events")
              : `${user.eventIds.length} ${uiLabel("Assigned events").toLowerCase()}`}
          </Badge>
        </div>
      </div>
    </Panel>
  );
}

const WEEK = 7 * 86_400_000;

export function Dashboard() {
  const { data, update, user } = useWorkspace();
  const active = data.events.filter(
    (e) => !["Completed", "Cancelled"].includes(e.status),
  );
  const pending = data.conversations.filter(
    (c) => c.review === "Pending",
  ).length;
  const next = [...active].sort((a, b) => a.date.localeCompare(b.date))[0];
  const venue = data.venues.find((v) => v.id === next?.venueId);
  const pipeline = pipelineReport(data).filter((row) =>
    ["Draft", "In review", "Ready to send", "Issued"].includes(row.status),
  );
  const pipelineValue = pipeline.reduce((sum, row) => sum + row.value, 0);
  const pipelineCount = pipeline.reduce((sum, row) => sum + row.count, 0);
  const soon = new Date(Date.now() + WEEK).toISOString().slice(0, 10);
  const weekTasks = data.tasks.filter((t) => !t.done && t.date <= soon);
  const openTasks = data.tasks.filter((t) => !t.done);
  const date = new Date().toLocaleDateString("es-PR", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const actions = [
    {
      to: "/proposals?new=manual",
      label: "Nueva propuesta",
      icon: <FilePlus2 size={18} aria-hidden="true" />,
      allowed:
        canEditCollection(user, "proposals") &&
        canSeeModule(user, "/proposals"),
    },
    {
      to: "/events?new=1",
      label: "Nuevo evento",
      icon: <CalendarPlus size={18} aria-hidden="true" />,
      allowed: canEditCollection(user, "events"),
    },
    {
      to: "/design",
      label: "Abrir KIT Design",
      icon: <Layers3 size={18} aria-hidden="true" />,
      allowed: canSeeModule(user, "/design"),
    },
  ].filter((action) => action.allowed);
  return (
    <>
      <PageHeader
        eyebrow={date}
        title="Dashboard"
        actions={
          canEditCollection(user, "events") ? (
            <Link className="button primary" to="/events?new=1">
              <CalendarPlus size={17} aria-hidden="true" />
              {uiLabel("Create event")}
            </Link>
          ) : undefined
        }
      />
      <div className="dashboard-actions">
        {actions.map((action) => (
          <Link key={action.to} className="dashboard-action" to={action.to}>
            {action.icon}
            <span>{action.label}</span>
          </Link>
        ))}
        {canSeeModule(user, "/kit") && (
          <Link className="dashboard-action" to="/kit">
            <Sparkles size={18} aria-hidden="true" />
            <span>Abrir KIT</span>
          </Link>
        )}
      </div>
      <div className="stat-grid">
        <Stat
          label="Active events"
          value={active.length.toString().padStart(2, "0")}
          icon={<CalendarDays size={18} aria-hidden="true" />}
        />
        <Stat
          label="Propuestas en curso"
          value={money(pipelineValue)}
          detail={
            <Link to="/proposals">
              {pipelineCount} {pipelineCount === 1 ? "propuesta" : "propuestas"}{" "}
              · {uiLabel("Review your pipeline")}{" "}
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          }
          icon={<FileText size={18} aria-hidden="true" />}
        />
        <Stat
          label="Tareas esta semana"
          value={weekTasks.length.toString().padStart(2, "0")}
          detail={
            <Link to="/production">
              {openTasks.length} abiertas en total · {uiLabel("Production")}{" "}
              <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          }
          icon={<Users size={18} aria-hidden="true" />}
        />
        <Stat
          label="Respuestas por revisar"
          value={pending.toString().padStart(2, "0")}
          detail={
            <Link to="/inbox">
              Mensajes de clientes <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
          }
          icon={<Clock3 size={18} aria-hidden="true" />}
        />
      </div>
      <div className="dashboard-focus">
        <div className="next-event">
          <div className="next-event-content">
            <span className="eyebrow light">
              <span className="live-dot" />
              {uiLabel("NEXT ON THE CALENDAR")}
            </span>
            <h2>{next?.name || uiLabel("No upcoming events")}</h2>
            {next && (
              <p>
                {venue?.name}
                <span>·</span>
                {shortDate(next.date)}
              </p>
            )}
            <div className="next-event-bottom">
              {next && (
                <Link to={`/events/${next.id}`}>
                  {uiLabel("Open event")}
                  <ArrowUpRight size={17} aria-hidden="true" />
                </Link>
              )}
            </div>
          </div>
          <StageArt />
        </div>
        <div className="attention-card">
          <div className="attention-heading">
            <span className="attention-icon">
              <Clock3 size={18} aria-hidden="true" />
            </span>
            <span>{uiLabel("OWNER'S DESK")}</span>
            <Badge tone="amber">{`${pending} ${uiLabel("pending")}`}</Badge>
          </div>
          <h2>
            {pending ? (
              <>
                {uiLabel("A client is ready.")} <br />
                {uiLabel("Your move.")}
              </>
            ) : (
              <>
                Todo al día. <br />
                Sigue creando.
              </>
            )}
          </h2>
          <p>
            {pending
              ? uiLabel(
                  "A proposal response is waiting for your review. You have the final say.",
                )
              : "No hay respuestas de clientes pendientes de revisión."}
          </p>
          <Link className="attention-link" to="/inbox">
            {uiLabel("Review client responses")}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="dashboard-columns">
        <Panel
          title="Upcoming events"
          action={<TextLink to="/events">{uiLabel("All events")}</TextLink>}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{uiLabel("Event / client")}</th>
                  <th>{uiLabel("Date")}</th>
                  <th>{uiLabel("Status")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 5).map((event) => {
                  const c = data.clients.find((c) => c.id === event.clientId);
                  return (
                    <tr key={event.id}>
                      <td>
                        <Link
                          className="record-cell"
                          to={`/events/${event.id}`}
                        >
                          <Avatar
                            label={c?.initials || "EV"}
                            color={c?.color}
                          />
                          <span>
                            <strong>{event.name}</strong>
                            <small>{c?.name}</small>
                          </span>
                        </Link>
                      </td>
                      <td className="nowrap">{shortDate(event.date)}</td>
                      <td>
                        <Badge>{event.status}</Badge>
                      </td>
                      <td>
                        <Link
                          className="icon-button"
                          aria-label={`${uiLabel("Open")} ${event.name}`}
                          to={`/events/${event.id}`}
                        >
                          <ArrowUpRight size={17} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {active.length === 0 && (
              <p className="muted dashboard-empty">
                Sin eventos activos. Crea el primero para empezar.
              </p>
            )}
          </div>
        </Panel>
        <Panel
          title="Your production checklist"
          action={<TextLink to="/production">{uiLabel("View all")}</TextLink>}
        >
          <div className="task-list">
            {(weekTasks.length ? weekTasks : openTasks)
              .slice(0, 5)
              .map((task) => (
                <label
                  className={`task-item ${task.done ? "done" : ""}`}
                  key={task.id}
                >
                  <input
                    type="checkbox"
                    checked={task.done}
                    disabled={!canEditCollection(user, "tasks")}
                    onChange={() =>
                      update((s) => ({
                        ...s,
                        tasks: s.tasks.map((t) =>
                          t.id === task.id ? { ...t, done: !t.done } : t,
                        ),
                      }))
                    }
                  />
                  <span>
                    <strong>{task.title}</strong>
                    <small>
                      {data.events.find((e) => e.id === task.eventId)?.name}
                    </small>
                    <span className="task-due">
                      {shortDate(task.date)} · {task.assignee.split(" ")[0]}
                    </span>
                  </span>
                </label>
              ))}
            {openTasks.length === 0 && (
              <p className="muted dashboard-empty">Sin tareas pendientes.</p>
            )}
          </div>
        </Panel>
      </div>
      <YourAccess />
      <Panel title="Recent activity">
        <div className="activity-list">
          {data.activity.slice(0, 8).map((item, i) => (
            <div className="activity-row" key={item.id}>
              <span className={`activity-dot dot-${i % 3}`} />
              <div>
                <strong>{activityLabel(item.title)}</strong>
                <p>{item.detail}</p>
              </div>
              {item.eventId && (
                <Link
                  to={`/events/${item.eventId}`}
                  aria-label={`${uiLabel("View event for")} ${activityLabel(item.title)}`}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
          ))}
          {data.activity.length === 0 && (
            <p className="muted dashboard-empty">Todavía no hay actividad.</p>
          )}
        </div>
      </Panel>
    </>
  );
}
export function StageArt() {
  return (
    <svg
      className="stage-art"
      viewBox="0 0 300 230"
      fill="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient
          id="stageScreen"
          x1="130"
          y1="40"
          x2="250"
          y2="145"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#b8d88e" />
          <stop offset="1" stopColor="#467264" />
        </linearGradient>
        <linearGradient id="stageBeam">
          <stop stopColor="#d9efa9" stopOpacity=".2" />
          <stop offset="1" stopColor="#d9efa9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M13 164 155 225 296 151 161 93Z" fill="#4b695a" opacity=".22" />
      <path d="m54 151 107 48 103-54-108-43Z" fill="#77937a" />
      <path d="M54 151v10l107 48v-10m0 10 103-54v-10" fill="#41594c" />
      <path
        d="m95 126 66 29 65-33V57L160 29 95 62Z"
        fill="#1a2a24"
        stroke="#6e8e71"
        strokeWidth="2"
      />
      <path
        d="m103 120 58 26 58-29V63l-59-25-57 29Z"
        fill="url(#stageScreen)"
      />
      <path d="m123 93 27-10 18 21 29-20" stroke="#e3f0c8" strokeWidth="2" />
      <path
        d="M75 139V51l85-42 84 36v91M75 58l85-42 84 36"
        stroke="#90a48b"
        strokeWidth="3"
      />
      <path
        d="m82 53 12 7m9-18 12 7m10-18 12 7m10-18 12 7m15-1 12 13m10-3 12 13m10-3 12 13"
        stroke="#90a48b"
      />
      <path
        d="m89 61-41 105 100 43-24-166M214 60l-25 151 96-56-53-87"
        fill="url(#stageBeam)"
      />
      <path
        d="m62 110 15 7v34l-15-7Zm181-4-15 8v33l15-8Z"
        fill="#1b2a24"
        stroke="#7a947b"
      />
      <circle cx="68" cy="124" r="3" fill="#5c7963" />
      <circle cx="68" cy="135" r="3" fill="#5c7963" />
      <path d="m152 122 8 3 8-4v-10l-8-3-8 4Z" fill="#e0edbd" />
      <path d="M160 125v16" stroke="#d1deb0" />
      <circle cx="91" cy="56" r="4" fill="#d9efa9" />
      <circle cx="128" cy="37" r="4" fill="#d9efa9" />
      <circle cx="197" cy="37" r="4" fill="#d9efa9" />
      <circle cx="232" cy="52" r="4" fill="#d9efa9" />
    </svg>
  );
}
