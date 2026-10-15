import {
  ArrowRight,
  ArrowUpRight,
  Box,
  CalendarDays,
  ChevronRight,
  Clock3,
  FileText,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useWorkspace } from "../shared/store";
import { Avatar, Badge, PageHeader, Panel, Stat, TextLink } from "../shared/ui";
import { shortDate } from "../shared/domain";
export function Dashboard() {
  const { data, update } = useWorkspace();
  const active = data.events.filter(
    (e) => !["Completed", "Cancelled"].includes(e.status),
  );
  const pending = data.conversations.filter(
    (c) => c.review === "Pending",
  ).length;
  const next = [...active].sort((a, b) => a.date.localeCompare(b.date))[0];
  const venue = data.venues.find((v) => v.id === next?.venueId);
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return (
    <>
      <PageHeader
        eyebrow={date}
        title="Your next great event starts here."
        description="A clear view of your projects, your people, and what's next."
        actions={
          <Link className="button primary" to="/events?new=1">
            <Plus size={17} />
            Create event
          </Link>
        }
      />
      <div className="stat-grid">
        <Stat
          label="Active events"
          value={active.length.toString().padStart(2, "0")}
          detail={
            <>
              <span className="mini-dot green" />
              Moving from plan to production
            </>
          }
          icon={<CalendarDays size={18} />}
        />
        <Stat
          label="Proposals in progress"
          value={data.proposals
            .filter((p) =>
              ["Draft", "In review", "Issued", "Ready to send"].includes(
                p.status,
              ),
            )
            .length.toString()
            .padStart(2, "0")}
          detail={
            <Link to="/proposals">
              Review your pipeline <ArrowUpRight size={13} />
            </Link>
          }
          icon={<FileText size={18} />}
        />
        <Stat
          label="Equipment in catalog"
          value={data.equipment.reduce((s, e) => s + e.quantity, 0)}
          detail={<>{data.equipment.length} products across your inventory</>}
          icon={<Box size={18} />}
        />
        <Stat
          label="Open production tasks"
          value={data.tasks
            .filter((t) => !t.done)
            .length.toString()
            .padStart(2, "0")}
          detail={
            <Link to="/production">
              Keep your team in sync <ArrowUpRight size={13} />
            </Link>
          }
          icon={<Users size={18} />}
        />
      </div>
      <div className="dashboard-focus">
        <div className="next-event">
          <div className="next-event-content">
            <span className="eyebrow light">
              <span className="live-dot" />
              NEXT ON THE CALENDAR
            </span>
            <h2>{next?.name || "Room for your next big idea."}</h2>
            <p>
              {venue?.name || "Create an event to get started."}
              <span>·</span>
              {next ? shortDate(next.date) : "Your workspace is ready"}
            </p>
            <div className="next-event-bottom">
              <div className="avatar-stack">
                <Avatar label="AM" small />
                <Avatar label="SR" color="lavender" small />
                <Avatar label="MD" color="peach" small />
                <span>Your production team</span>
              </div>
              {next && (
                <Link to={`/events/${next.id}`}>
                  Open event
                  <ArrowUpRight size={17} />
                </Link>
              )}
            </div>
          </div>
          <StageArt />
        </div>
        <div className="attention-card">
          <div className="attention-heading">
            <span className="attention-icon">
              <Clock3 size={18} />
            </span>
            <span>OWNER'S DESK</span>
            <Badge tone="amber">{pending} pending</Badge>
          </div>
          <h2>
            {pending ? (
              <>
                A client is ready. <br />
                Your move.
              </>
            ) : (
              <>
                All clear. <br />
                Keep creating.
              </>
            )}
          </h2>
          <p>
            {pending
              ? "A proposal response is waiting for your review. You have the final say."
              : "There are no client acceptance requests waiting for review."}
          </p>
          <Link className="attention-link" to="/inbox">
            Review client responses
            <ArrowRight size={17} />
          </Link>
        </div>
      </div>
      <div className="dashboard-columns">
        <Panel
          title="Upcoming events"
          subtitle="The work taking shape over the next few weeks."
          action={<TextLink to="/events">All events</TextLink>}
        >
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event / client</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {active.slice(0, 4).map((event) => {
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
                          aria-label={`Open ${event.name}`}
                          to={`/events/${event.id}`}
                        >
                          <ArrowUpRight size={17} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel
          title="Your production checklist"
          subtitle="Small steps. Seamless events."
          action={<TextLink to="/production">View all</TextLink>}
        >
          <div className="task-list">
            {data.tasks.slice(0, 4).map((task) => (
              <label
                className={`task-item ${task.done ? "done" : ""}`}
                key={task.id}
              >
                <input
                  type="checkbox"
                  checked={task.done}
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
          </div>
        </Panel>
      </div>
      <div className="dashboard-bottom">
        <Panel
          title="Recent activity"
          action={<span className="muted tiny">Sample workspace activity</span>}
        >
          <div className="activity-list">
            {data.activity.slice(0, 3).map((item, i) => (
              <div className="activity-row" key={item.id}>
                <span className={`activity-dot dot-${i}`} />
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                {item.eventId && (
                  <Link
                    to={`/events/${item.eventId}`}
                    aria-label={`View event for ${item.title}`}
                  >
                    <ChevronRight size={16} />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </Panel>
        <div className="creative-prompt">
          <span className="creative-prompt-icon">
            <Sparkles size={23} />
          </span>
          <div className="eyebrow">FROM IDEA TO EXPERIENCE</div>
          <h2>
            Make room for
            <br />
            your next big idea.
          </h2>
          <p>
            Bring layouts, visuals, and your event story together in one place.
          </p>
          <Link to="/design">
            Explore Design Studio
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </div>
      <footer className="workspace-footer">
        <span>
          <span className="brand-small">kit.</span> A little more organized. A
          lot more possible.
        </span>
        <span>
          Production workspace <span className="mini-dot green" />
        </span>
      </footer>
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
