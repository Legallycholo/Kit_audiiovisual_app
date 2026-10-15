import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Box,
  CalendarDays,
  Download,
  FileText,
  Image,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
  Video,
  WandSparkles,
} from "lucide-react";
import { useWorkspace, activity } from "../shared/store";
import {
  Avatar,
  Badge,
  Button,
  Empty,
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
  id,
  initials,
  money,
  quoteTotals,
  shortDate,
} from "../shared/domain";
import type { Task } from "../shared/types";
export function Production() {
  const { data, update, toast } = useWorkspace();
  const [params] = useSearchParams();
  const [eventFilter, setEventFilter] = useState(params.get("event") || "all");
  const [tab, setTab] = useState("Task board");
  const [draft, setDraft] = useState<Task | null>(null);
  const tasks = data.tasks.filter(
    (t) => eventFilter === "all" || t.eventId === eventFilter,
  );
  const crew = Array.from(new Set(data.tasks.map((t) => t.assignee)));
  return (
    <>
      <PageHeader
        eyebrow="GOOD PEOPLE. GREAT PRODUCTIONS."
        title="Team & production"
        description="Keep the crew aligned, the gear ready, and the show on schedule."
        actions={
          <Button
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
        <div className="crew-grid">
          {crew.map((name) => (
            <Panel key={name}>
              <div className="panel-body">
                <div className="profile-header">
                  <Avatar label={initials(name)} />
                  <div>
                    <h3>{name}</h3>
                    <p>{data.tasks.find((t) => t.assignee === name)?.role}</p>
                  </div>
                </div>
                {tasks
                  .filter((t) => t.assignee === name)
                  .map((t) => (
                    <div className="crew-assignment" key={t.id}>
                      <span>{shortDate(t.date)}</span>
                      <strong>{t.title}</strong>
                      <Badge>{t.done ? "Completed" : t.phase}</Badge>
                    </div>
                  ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
      {tab === "Run of show" && (
        <Panel
          title="Event timeline"
          subtitle="Tasks arranged by date. Detailed timed cues are a later production capability."
        >
          <div className="panel-body">
            {[...tasks]
              .sort((a, b) => a.date.localeCompare(b.date))
              .map((t) => (
                <div className="timeline-item" key={t.id}>
                  <span className="date-pill">{shortDate(t.date)}</span>
                  <div>
                    <strong>{t.title}</strong>
                    <p>
                      {t.assignee} ·{" "}
                      {data.events.find((e) => e.id === t.eventId)?.name}
                    </p>
                  </div>
                  <Badge>{t.done ? "Completed" : t.phase}</Badge>
                </div>
              ))}
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
                      return {shortDate(r.end)}
                    </small>
                  </div>
                  <Badge>{r.status}</Badge>
                </div>
              ))}
            <Placeholder
              title="Detailed custody and inspection"
              description="Partial returns, damage reports, and transport assignments will extend this handoff."
            />
          </div>
        </Panel>
      )}
      {draft && (
        <Modal title="Add a production task" onClose={() => setDraft(null)}>
          <form
            className="modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              update((s) => ({
                ...s,
                tasks: [...s.tasks, draft],
                activity: [
                  activity("Production task added", draft.title, draft.eventId),
                  ...s.activity,
                ],
              }));
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
                <input
                  required
                  value={draft.assignee}
                  onChange={(e) =>
                    setDraft({ ...draft, assignee: e.target.value })
                  }
                />
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
  const { data } = useWorkspace();
  const latest = data.proposals.filter((p) => p.status !== "Superseded");
  const accepted = latest.filter((p) => p.status === "Accepted");
  const total = latest.reduce(
    (sum, p) => sum + quoteTotals(p.lines, p.discount, p.tax).total,
    0,
  );
  const acceptedTotal = accepted.reduce(
    (sum, p) => sum + quoteTotals(p.lines, p.discount, p.tax).total,
    0,
  );
  return (
    <>
      <PageHeader
        eyebrow="A CLEARER PICTURE"
        title="Reports"
        description="A view of planned work and commercial scope, grounded in your records."
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              downloadFile(
                "kit-report.json",
                JSON.stringify(
                  {
                    exportedAt: new Date().toISOString(),
                    source: "Sample workspace",
                    proposalValue: total,
                    acceptedValue: acceptedTotal,
                    proposalCount: latest.length,
                    eventCount: data.events.length,
                  },
                  null,
                  2,
                ),
              )
            }
          >
            <Download size={16} />
            Export summary
          </Button>
        }
      />
      <div className="stat-grid">
        <Stat
          label="Quoted scope"
          value={money(total)}
          detail="Current proposal revisions · not revenue"
          icon={<FileText size={18} />}
        />
        <Stat
          label="Accepted scope"
          value={money(acceptedTotal)}
          detail="Owner-confirmed offers · not collected cash"
          icon={<ShieldCheck size={18} />}
        />
        <Stat
          label="Events"
          value={data.events.length}
          detail="Across all production stages"
          icon={<CalendarDays size={18} />}
        />
        <Stat
          label="Tasks completed"
          value={`${data.tasks.filter((t) => t.done).length}/${data.tasks.length}`}
          detail="Current production checklist"
          icon={<Users size={18} />}
        />
      </div>
      <div className="detail-grid">
        <Panel title="Event pipeline">
          <div className="panel-body chart-bars">
            {[
              "Planning",
              "Confirmed",
              "Preparation",
              "In production",
              "Completed",
            ].map((status) => {
              const count = data.events.filter(
                (e) => e.status === status,
              ).length;
              return (
                <div key={status}>
                  <div>
                    <span>{status}</span>
                    <strong>{count}</strong>
                  </div>
                  <span className="bar-track">
                    <i
                      style={{
                        width: `${(count / Math.max(1, data.events.length)) * 100}%`,
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Commercial scope by event">
          <div className="panel-body">
            {latest.map((p) => (
              <Link to={`/proposals/${p.id}`} className="simple-row" key={p.id}>
                <span>
                  <strong>
                    {data.events.find((e) => e.id === p.eventId)?.name}
                  </strong>
                  <small>
                    {p.number} · v{p.version}
                  </small>
                </span>
                <strong>
                  {money(quoteTotals(p.lines, p.discount, p.tax).total)}
                </strong>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
      <div className="info-note">
        Actual profitability, collected payments, and utilization over time
        require cost, accounting, and completed fulfillment records. Those
        metrics are not inferred from quotations.
      </div>
    </>
  );
}
export function Creative() {
  const { data, toast } = useWorkspace();
  const [params] = useSearchParams();
  const [tab, setTab] = useState("Concepts & media");
  const [eventId, setEventId] = useState(
    params.get("event") || data.events[0]?.id || "",
  );
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState("Event concept");
  return (
    <>
      <PageHeader
        eyebrow="IMAGINE THE EXPERIENCE"
        title="AI Creative Studio"
        description="A space for concepts, visual direction, and the details that make it yours."
        actions={<Badge tone="neutral">Generation not connected</Badge>}
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
                  onChange={(e) => setEventId(e.target.value)}
                >
                  {data.events.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What are we creating?">
                <select value={kind} onChange={(e) => setKind(e.target.value)}>
                  {[
                    "Event concept",
                    "Stage concept",
                    "Lighting concept",
                    "Promotional visual",
                    "Image edit",
                    "Event video",
                  ].map((v) => (
                    <option key={v}>{v}</option>
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
              <div className="connection-note">
                <Sparkles size={20} />
                <div>
                  <strong>Ready for your creative workflow</strong>
                  <p>
                    Image generation, reference uploads, and brand application
                    will be connected to an approved AI service.
                  </p>
                </div>
              </div>
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
          </Panel>
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
                  Video
                </span>
              </div>
            </div>
            <small>
              Creative visuals are separate from dimensioned production designs.
            </small>
          </div>
        </div>
      ) : (
        <Empty
          title={
            tab === "Brand assets"
              ? "Every brand has a story"
              : "Only your best work goes forward"
          }
          description={
            tab === "Brand assets"
              ? "Client logos, palettes, and authorized references will be organized here when file storage is connected."
              : "Reviewed creative assets will be selectable for specific proposal revisions."
          }
        />
      )}
    </>
  );
}
export function SettingsPage() {
  const { data, update, toast, reset } = useWorkspace();
  const [tab, setTab] = useState("Company profile");
  const [settings, setSettings] = useState({ ...data.settings });
  const [resetting, setResetting] = useState(false);
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
                onSubmit={(e) => {
                  e.preventDefault();
                  update((s) => ({ ...s, settings }));
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
          {tab === "Users & roles" && (
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
                    "AI assistant",
                    "Contextual summaries, equipment suggestions, and editable proposal drafts.",
                  ],
                  [
                    "Creative generation",
                    "Images, editing, and later video generation.",
                  ],
                  [
                    "Shared storage & authentication",
                    "Secure team accounts, files, and shared business records.",
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
                    <Badge tone="neutral">Not connected</Badge>
                  </div>
                ))}
              </div>
            </Panel>
          )}
          {tab === "Activity history" && (
            <Panel
              title="Workspace activity"
              subtitle="Local sample history; a protected server audit log is still required for production."
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
                    onChange={(e) => {
                      update((s) => ({
                        ...s,
                        settings: {
                          ...s.settings,
                          notifications: e.target.checked,
                        },
                      }));
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
          {tab === "Workspace data" && (
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
