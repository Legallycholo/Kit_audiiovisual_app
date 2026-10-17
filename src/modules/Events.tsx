import { canEditCollection } from "../shared/access";
import { uiLabel } from "../shared/i18n";
import { useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Plus,
  Users,
  List,
  Calendar,
  FileText,
  Layers3,
  WandSparkles,
} from "lucide-react";
import { activity, useWorkspace } from "../shared/store";
import {
  Avatar,
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchField,
  Tabs,
  TextLink,
} from "../shared/ui";
import { id, money, shortDate } from "../shared/domain";
import type { EventStatus, ProductionEvent } from "../shared/types";
export function Events() {
  const { data } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All events");
  const [view, setView] = useState("List");
  const events = data.events.filter(
    (e) =>
      `${e.name} ${data.clients.find((c) => c.id === e.clientId)?.name}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All events" || e.status === filter),
  );
  return (
    <>
      <PageHeader
        title="Events"
        actions={
          <Button onClick={() => setParams({ new: "1" })}>
            <Plus size={17} />
            Create event
          </Button>
        }
      />
      <Panel>
        <div className="list-toolbar">
          <Tabs
            items={[
              "All events",
              "Planning",
              "Confirmed",
              "Preparation",
              "Completed",
            ]}
            value={filter}
            onChange={setFilter}
          />
          <div className="toolbar-right">
            <SearchField
              value={search}
              onChange={setSearch}
              placeholder="Search events…"
            />
            <button
              className={`icon-button ${view === "List" ? "selected" : ""}`}
              aria-label="List view"
              onClick={() => setView("List")}
            >
              <List size={18} />
            </button>
            <button
              className={`icon-button ${view === "Calendar" ? "selected" : ""}`}
              aria-label="Calendar view"
              onClick={() => setView("Calendar")}
            >
              <Calendar size={18} />
            </button>
          </div>
        </div>
        {events.length === 0 ? (
          <Empty
            title="No events found"
            description="Try another filter, or create your next event."
          />
        ) : view === "List" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Event / client</th>
                  <th>Venue</th>
                  <th>Dates</th>
                  <th>Status</th>
                  <th>Manager</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {events.map((event) => {
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
                      <td>
                        {data.venues.find((v) => v.id === event.venueId)
                          ?.name || "Venue to be confirmed"}
                      </td>
                      <td className="nowrap">
                        {shortDate(event.date)}
                        {event.endDate !== event.date &&
                          `–${shortDate(event.endDate)}`}
                      </td>
                      <td>
                        <Badge>{event.status}</Badge>
                      </td>
                      <td>{event.manager}</td>
                      <td>
                        <Link
                          className="icon-button"
                          to={`/events/${event.id}`}
                          aria-label={`Open ${event.name}`}
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
        ) : (
          <div className="calendar-list">
            {[...events]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((e) => (
                <Link
                  className="calendar-event"
                  key={e.id}
                  to={`/events/${e.id}`}
                >
                  <div className="date-block">
                    <span>{shortDate(e.date).split(" ")[0]}</span>
                    <strong>{new Date(`${e.date}T12:00:00`).getDate()}</strong>
                  </div>
                  <div>
                    <h3>{e.name}</h3>
                    <p>
                      {data.venues.find((v) => v.id === e.venueId)?.name} ·{" "}
                      {e.type}
                    </p>
                  </div>
                  <Badge>{e.status}</Badge>
                  <ArrowUpRight size={18} />
                </Link>
              ))}
          </div>
        )}
        <div className="table-footer">
          {events.length} events{" "}
          <span>Times shown in {data.settings.timezone}</span>
        </div>
      </Panel>
      {params.has("new") && <EventForm onClose={() => setParams({})} />}
    </>
  );
}
export function EventForm({
  onClose,
  event,
}: {
  onClose: () => void;
  event?: ProductionEvent;
}) {
  const { data, update, toast, user } = useWorkspace();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<ProductionEvent>(
    event || {
      id: id(),
      name: "",
      clientId: data.clients[0]?.id || "",
      venueId: data.venues[0]?.id || "",
      date: "",
      endDate: "",
      status: "Planning",
      type: "Conference",
      manager: user?.name || "Alex Morgan",
      budget: 0,
      attendees: 0,
      notes: "",
      timezone: data.settings.timezone,
    },
  );
  const field = <K extends keyof ProductionEvent>(
    key: K,
    value: ProductionEvent[K],
  ) => setDraft({ ...draft, [key]: value });
  return (
    <Modal
      title={event ? "Edit event" : "Create an event"}
      description="Start with the essentials. The details can take shape as you go."
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          if (draft.endDate < draft.date) return;
          if (
            !(await update((s) => ({
              ...s,
              events: event
                ? s.events.map((ev) => (ev.id === event.id ? draft : ev))
                : [...s.events, draft],
              activity: [
                activity(
                  event ? "Event updated" : "Event created",
                  draft.name,
                  draft.id,
                ),
                ...s.activity,
              ],
            })))
          )
            return;
          toast(event ? "Event updated." : "Your event is ready to plan.");
          onClose();
          navigate(`/events/${draft.id}`);
        }}
      >
        <Field label="Event name">
          <input
            required
            autoFocus
            value={draft.name}
            onChange={(e) => field("name", e.target.value)}
            placeholder="e.g. Annual leadership summit"
          />
        </Field>
        <div className="form-grid">
          <Field label="Client">
            <select
              required
              value={draft.clientId}
              onChange={(e) => field("clientId", e.target.value)}
            >
              {data.clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Venue">
            <select
              value={draft.venueId}
              onChange={(e) => field("venueId", e.target.value)}
            >
              <option value="">To be confirmed</option>
              {data.venues.map((v) => (
                <option value={v.id} key={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input
              required
              type="date"
              value={draft.date}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  date: e.target.value,
                  endDate: draft.endDate || e.target.value,
                })
              }
            />
          </Field>
          <Field label="End date">
            <input
              required
              type="date"
              min={draft.date}
              value={draft.endDate}
              onChange={(e) => field("endDate", e.target.value)}
            />
          </Field>
          <Field label="Event type">
            <select
              value={draft.type}
              onChange={(e) => field("type", e.target.value)}
            >
              {[
                "Conference",
                "Corporate",
                "Concert",
                "Exhibition",
                "Theater",
                "Wedding",
                "Private event",
                "Other",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="Project manager">
            <input
              required
              value={draft.manager}
              onChange={(e) => field("manager", e.target.value)}
            />
          </Field>
          <Field label="Budget · USD">
            <input
              type="number"
              min="0"
              value={draft.budget}
              onChange={(e) => field("budget", Number(e.target.value))}
            />
          </Field>
          <Field label="Attendees">
            <input
              type="number"
              min="0"
              step="1"
              value={draft.attendees}
              onChange={(e) => field("attendees", Number(e.target.value))}
            />
          </Field>
        </div>
        <Field label="Event brief">
          <textarea
            rows={3}
            value={draft.notes}
            onChange={(e) => field("notes", e.target.value)}
            placeholder="What does a successful event look like?"
          />
        </Field>
        <div className="modal-actions">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button>{event ? "Save event" : "Create event"}</Button>
        </div>
      </form>
    </Modal>
  );
}
export function EventDetail() {
  const { eventId } = useParams();
  const { data, update, toast, user } = useWorkspace();
  const [tab, setTab] = useState("Overview");
  const commercial =
    !user || ["Administrator", "Sales Manager"].includes(user.role);
  const [editing, setEditing] = useState(false);
  const event = data.events.find((e) => e.id === eventId);
  if (!event)
    return (
      <Empty
        title="Event not found"
        description="This event may no longer exist in this workspace."
        action={<Link to="/events">Back to events</Link>}
      />
    );
  const client = data.clients.find((c) => c.id === event.clientId);
  const venue = data.venues.find((v) => v.id === event.venueId);
  const tasks = data.tasks.filter((t) => t.eventId === event.id);
  const proposals = data.proposals.filter((p) => p.eventId === event.id);
  return (
    <>
      <Link className="back-link" to="/events">
        <ArrowLeft size={15} />
        All events
      </Link>
      <PageHeader
        eyebrow={`${event.type} · ${client?.name || "Client not assigned"}`}
        title={event.name}
        description={`${shortDate(event.date)} – ${shortDate(event.endDate)} · ${event.timezone}`}
        actions={
          <>
            <Badge>{event.status}</Badge>
            <Button
              disabled={!commercial}
              variant="secondary"
              onClick={() => setEditing(true)}
            >
              Edit event
            </Button>
          </>
        }
      />
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          "Overview",
          "Schedule",
          "Venue & Design",
          "Equipment",
          "Commercial",
          "Team & Production",
          "Creative Assets",
          "Messages",
          "Documents",
          "Activity",
        ].filter(
          (item) => commercial || !["Commercial", "Messages"].includes(item),
        )}
      />
      {tab === "Overview" && (
        <div className="detail-grid">
          <Panel title="The event brief">
            <div className="panel-body">
              <p className="lead-text">
                {event.notes ||
                  "Add your event requirements and production goals."}
              </p>
              <div className="detail-facts">
                <div>
                  <span>Client</span>
                  <Link to={`/clients?client=${client?.id}`}>
                    {client?.name}
                  </Link>
                </div>
                <div>
                  <span>Venue</span>
                  <strong>{venue?.name || "To be confirmed"}</strong>
                </div>
                <div>
                  <span>Project manager</span>
                  <strong>{event.manager}</strong>
                </div>
                <div>
                  <span>Attendees</span>
                  <strong>{event.attendees}</strong>
                </div>
                {commercial && (
                  <div>
                    <span>Estimated budget</span>
                    <strong>{money(event.budget)}</strong>
                  </div>
                )}
                <div>
                  <span>Status</span>
                  <select
                    disabled={!canEditCollection(user, "events")}
                    aria-label="Event status"
                    value={event.status}
                    onChange={async (e) => {
                      if (
                        !(await update((s) => ({
                          ...s,
                          events: s.events.map((ev) =>
                            ev.id === event.id
                              ? { ...ev, status: e.target.value as EventStatus }
                              : ev,
                          ),
                          activity: [
                            activity(
                              "Event status updated",
                              `${event.name}: ${e.target.value}`,
                              event.id,
                            ),
                            ...s.activity,
                          ],
                        })))
                      )
                        return;
                      toast(
                        "Event status updated. Equipment and approvals are managed separately.",
                      );
                    }}
                  >
                    {[
                      "Planning",
                      "Confirmed",
                      "Preparation",
                      "In production",
                      "Completed",
                      "Cancelled",
                    ].map((status) => (
                      <option
                        key={status}
                        disabled={
                          [
                            "Preparation",
                            "In production",
                            "Completed",
                          ].includes(status) && status !== event.status
                        }
                      >
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </Panel>
          <Panel title="Keep things moving">
            <div className="panel-body action-stack">
              <Link to={`/design?event=${event.id}`}>
                <Layers3 size={20} />
                <span>
                  Open event layout<small>Design your space in 2D and 3D</small>
                </span>
                <ArrowUpRight size={17} />
              </Link>
              <Link to={`/proposals?event=${event.id}`}>
                <FileText size={20} />
                <span>
                  Prepare a proposal
                  <small>{proposals.length} proposal revisions</small>
                </span>
                <ArrowUpRight size={17} />
              </Link>
              <Link to={`/production?event=${event.id}`}>
                <Users size={20} />
                <span>
                  Coordinate production
                  <small>
                    {tasks.filter((t) => !t.done).length} tasks remaining
                  </small>
                </span>
                <ArrowUpRight size={17} />
              </Link>
            </div>
          </Panel>
        </div>
      )}
      {tab === "Schedule" && (
        <Panel
          title="Event schedule"
          subtitle="Event dates are confirmed in the brief; detailed run of show is managed in production."
        >
          <div className="panel-body">
            <div className="timeline-item">
              <CalendarDays />
              <div>
                <strong>{shortDate(event.date)} — Event begins</strong>
                <p>{venue?.name || "Venue to be confirmed"}</p>
              </div>
            </div>
            <div className="timeline-item">
              <CalendarDays />
              <div>
                <strong>{shortDate(event.endDate)} — Event concludes</strong>
                <p>{event.timezone}</p>
              </div>
            </div>
            <p className="muted">
              {uiLabel(
                "Setup, rehearsal and teardown are planned in Production as crew shifts and run-of-show cues.",
              )}
            </p>
            <div className="link-row">
              <TextLink to={`/production?event=${event.id}&tab=crew`}>
                {uiLabel("Crew shifts")}
              </TextLink>
              <TextLink to={`/production?event=${event.id}&tab=cues`}>
                {uiLabel("Run-of-show cues")}
              </TextLink>
              <TextLink to={`/production?event=${event.id}`}>
                {uiLabel("Open production tasks")}
              </TextLink>
            </div>
          </div>
        </Panel>
      )}
      {tab === "Venue & Design" && (
        <Panel title={venue?.name || "Choose a venue"}>
          <div className="panel-body">
            <p>{venue?.notes}</p>
            {venue?.rooms.map((r) => (
              <div className="room-row" key={r.id}>
                <MapPin size={20} />
                <div>
                  <strong>{r.name}</strong>
                  <p>
                    {r.width} × {r.depth} m · {r.capacity} guests · height{" "}
                    {r.height} m
                  </p>
                </div>
                <Badge tone="amber">Dimensions unverified</Badge>
              </div>
            ))}
            <Link className="button primary" to={`/design?event=${event.id}`}>
              <Layers3 size={17} />
              Open Design Studio
            </Link>
          </div>
        </Panel>
      )}
      {tab === "Equipment" && (
        <Panel
          title="Equipment allocations"
          action={
            <TextLink to={`/inventory?event=${event.id}`}>
              Manage reservations
            </TextLink>
          }
        >
          <div className="panel-body">
            {data.reservations
              .filter((r) => r.eventId === event.id)
              .map((r) => (
                <div className="simple-row" key={r.id}>
                  <strong>
                    {data.equipment.find((q) => q.id === r.equipmentId)?.name}
                  </strong>
                  <span>{r.quantity} units</span>
                  <Badge>{r.status}</Badge>
                </div>
              ))}
            {!data.reservations.some((r) => r.eventId === event.id) && (
              <Empty
                title="No equipment allocated"
                description="Add equipment reservations for this event in Inventory."
              />
            )}
          </div>
        </Panel>
      )}
      {tab === "Commercial" && (
        <Panel
          title="Proposals & quotations"
          action={
            <TextLink to={`/proposals?event=${event.id}`}>
              Open proposals
            </TextLink>
          }
        >
          <div className="panel-body">
            {proposals.map((p) => (
              <Link className="simple-row" key={p.id} to={`/proposals/${p.id}`}>
                <span>
                  <strong>{p.title}</strong>
                  <small>
                    {p.number} · v{p.version}
                  </small>
                </span>
                <Badge>{p.status}</Badge>
                <ArrowUpRight size={17} />
              </Link>
            ))}
            {proposals.length === 0 && (
              <Empty
                title="Your proposal starts here"
                description="Create an editable quote linked to this event."
              />
            )}
          </div>
        </Panel>
      )}
      {tab === "Team & Production" && (
        <Panel
          title="Assigned tasks"
          action={
            <TextLink to={`/production?event=${event.id}`}>
              Open production
            </TextLink>
          }
        >
          <div className="task-list">
            {tasks.map((t) => (
              <label className="task-item" key={t.id}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() =>
                    update((s) => ({
                      ...s,
                      tasks: s.tasks.map((task) =>
                        task.id === t.id ? { ...task, done: !task.done } : task,
                      ),
                    }))
                  }
                />
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {t.assignee} · {shortDate(t.date)}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </Panel>
      )}
      {tab === "Messages" && (
        <Panel title="Client conversations">
          <div className="panel-body">
            {data.conversations
              .filter((c) => c.eventId === event.id)
              .map((c) => (
                <Link
                  className="simple-row"
                  key={c.id}
                  to={`/inbox?conversation=${c.id}`}
                >
                  <strong>{client?.name}</strong>
                  <Badge>
                    {c.review === "Pending"
                      ? "Awaiting owner review"
                      : "Conversation"}
                  </Badge>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            <TextLink to="/inbox">Open Client Inbox</TextLink>
          </div>
        </Panel>
      )}
      {tab === "Creative Assets" && (
        <Empty
          title="Build the visual story"
          description="Creative concepts and approved brand assets will stay linked to this event."
          action={
            <Link
              className="button secondary"
              to={`/creative?event=${event.id}`}
            >
              Open Creative Studio
            </Link>
          }
        />
      )}
      {tab === "Documents" && (
        <EventDocuments eventId={event.id} canCreateProposal={commercial} />
      )}
      {tab === "Activity" && (
        <Panel title="Event history">
          <div className="activity-list">
            {data.activity
              .filter((a) => a.eventId === event.id)
              .map((a) => (
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
      {editing && <EventForm event={event} onClose={() => setEditing(false)} />}
    </>
  );
}

/** Every document KIT keeps for one event: proposals, layouts and creative work. */
function EventDocuments({
  eventId,
  canCreateProposal,
}: {
  eventId: string;
  canCreateProposal: boolean;
}) {
  const { data } = useWorkspace();
  const proposals = data.proposals.filter((p) => p.eventId === eventId);
  const layouts = data.layouts.filter((l) => l.eventId === eventId);
  const creative = data.creativeAssets.filter((a) => a.eventId === eventId);
  if (!proposals.length && !layouts.length && !creative.length)
    return (
      <Empty
        icon={<FileText size={26} />}
        title="No documents for this event yet"
        description="Proposals, floor plans and creative concepts created for this event appear here."
        action={
          canCreateProposal ? (
            <Link className="button primary" to={`/proposals?event=${eventId}`}>
              <Plus size={16} />
              {uiLabel("New proposal")}
            </Link>
          ) : undefined
        }
      />
    );
  return (
    <div className="document-groups">
      {proposals.length > 0 && (
        <Panel title="Proposals">
          <ul className="document-list">
            {proposals.map((p) => (
              <li key={p.id}>
                <FileText size={18} aria-hidden="true" />
                <Link to={`/proposals/${p.id}`}>
                  {p.number} · {p.title}
                </Link>
                <Badge>{p.status}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {layouts.length > 0 && (
        <Panel title="Floor plans and 3D">
          <ul className="document-list">
            {layouts.map((l) => (
              <li key={l.id}>
                <Layers3 size={18} aria-hidden="true" />
                <Link to={`/design?event=${eventId}`}>{l.name}</Link>
                <span className="muted">v{l.version}</span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
      {creative.length > 0 && (
        <Panel title="Creative concepts">
          <ul className="document-list">
            {creative.map((a) => (
              <li key={a.id}>
                <WandSparkles size={18} aria-hidden="true" />
                <Link to={`/creative?event=${eventId}`}>{a.title}</Link>
                <Badge>{a.status}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
