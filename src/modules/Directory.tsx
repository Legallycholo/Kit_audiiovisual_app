import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight,
  Download,
  FileUp,
  Mail,
  MapPin,
  Plus,
  Ruler,
  Users,
} from "lucide-react";
import { useWorkspace, activity } from "../shared/store";
import { canEditCollection } from "../shared/access";
import { clientsToCsv, planClientImport } from "../shared/csv";
import { CsvImportDialog } from "./CsvImport";
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
} from "../shared/ui";
import { downloadFile, id, initials, shortDate } from "../shared/domain";
import type { Client, Venue } from "../shared/types";
export function Clients() {
  const { data, update, toast, user } = useWorkspace();
  const [importing, setImporting] = useState(false);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("Companies");
  const [draft, setDraft] = useState<Client | null>(null);
  const selected = data.clients.find((c) => c.id === params.get("client"));
  const clients = data.clients.filter((c) =>
    `${c.name} ${c.contact} ${c.email}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const newClient = () =>
    setDraft({
      id: id(),
      name: "",
      contact: "",
      email: "",
      phone: "",
      industry: "Corporate",
      initials: "",
      color: "sage",
      notes: "",
    });
  return (
    <>
      <PageHeader
        title="Clients"
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                downloadFile(
                  `kit-clientes-${new Date().toISOString().slice(0, 10)}.csv`,
                  clientsToCsv(data.clients),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={17} />
              Export CSV
            </Button>
            <Button
              disabled={!canEditCollection(user, "clients")}
              variant="secondary"
              onClick={() => setImporting(true)}
            >
              <FileUp size={17} />
              Import CSV
            </Button>
            <Button onClick={newClient}>
              <Plus size={17} />
              Add client
            </Button>
          </>
        }
      />
      <Panel>
        <div className="list-toolbar">
          <Tabs
            items={["Companies", "Contacts", "Opportunities"]}
            value={tab}
            onChange={setTab}
          />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search clients…"
          />
        </div>
        {tab === "Opportunities" ? (
          <Empty
            title="Your next opportunity"
            description="The sales pipeline will connect inquiries to events. Existing clients can already be linked directly to new events."
            action={
              <Link className="button secondary" to="/events?new=1">
                Create an event
              </Link>
            }
          />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{tab === "Contacts" ? "Contact" : "Company"}</th>
                  <th>{tab === "Contacts" ? "Company" : "Primary contact"}</th>
                  <th>Email</th>
                  <th>{tab === "Contacts" ? "Phone" : "Events"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <button
                        className="record-cell plain-button"
                        onClick={() => setParams({ client: c.id })}
                      >
                        <Avatar label={c.initials} color={c.color} />
                        <span>
                          <strong>
                            {tab === "Contacts" ? c.contact : c.name}
                          </strong>
                          <small>{c.industry}</small>
                        </span>
                      </button>
                    </td>
                    <td>{tab === "Contacts" ? c.name : c.contact}</td>
                    <td>{c.email}</td>
                    <td>
                      {tab === "Contacts"
                        ? c.phone
                        : data.events.filter((e) => e.clientId === c.id).length}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Open ${c.name}`}
                        onClick={() => setParams({ client: c.id })}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {clients.length === 0 && (
              <Empty
                title="No matching clients"
                description="Try another search or add a client."
              />
            )}
          </div>
        )}
      </Panel>
      {selected && (
        <Modal
          title={selected.name}
          description={selected.industry}
          onClose={() => setParams({})}
          wide
        >
          <div className="modal-body">
            <div className="profile-header">
              <Avatar label={selected.initials} color={selected.color} />
              <div>
                <h3>{selected.contact}</h3>
                <p>
                  {selected.email} · {selected.phone}
                </p>
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setDraft({ ...selected });
                  setParams({});
                }}
              >
                Edit profile
              </Button>
            </div>
            <h3>Internal notes</h3>
            <p>{selected.notes || "No notes yet."}</p>
            <h3>Related events</h3>
            {data.events
              .filter((e) => e.clientId === selected.id)
              .map((e) => (
                <Link className="simple-row" key={e.id} to={`/events/${e.id}`}>
                  <strong>{e.name}</strong>
                  <span>{shortDate(e.date)}</span>
                  <Badge>{e.status}</Badge>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
            <h3>Conversations</h3>
            {data.conversations
              .filter((c) => c.clientId === selected.id)
              .map((c) => (
                <Link
                  className="simple-row"
                  key={c.id}
                  to={`/inbox?conversation=${c.id}`}
                >
                  <span>WhatsApp · sample conversation</span>
                  <Badge>{c.review}</Badge>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
          </div>
        </Modal>
      )}
      {draft && (
        <Modal
          title={
            data.clients.some((c) => c.id === draft.id)
              ? "Edit client"
              : "Add a client"
          }
          onClose={() => setDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              const next = {
                ...draft,
                name: draft.name.trim(),
                initials: initials(draft.name),
              };
              if (!next.name) return;
              if (
                !(await update((s) => ({
                  ...s,
                  clients: s.clients.some((c) => c.id === next.id)
                    ? s.clients.map((c) => (c.id === next.id ? next : c))
                    : [...s.clients, next],
                  activity: [
                    activity("Client profile saved", next.name),
                    ...s.activity,
                  ],
                })))
              )
                return;
              toast("Client profile saved.");
              setDraft(null);
            }}
          >
            <Field label="Company / customer name">
              <input
                required
                autoFocus
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Primary contact">
              <input
                required
                value={draft.contact}
                onChange={(e) =>
                  setDraft({ ...draft, contact: e.target.value })
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Email">
                <input
                  type="email"
                  value={draft.email}
                  onChange={(e) =>
                    setDraft({ ...draft, email: e.target.value })
                  }
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={draft.phone}
                  onChange={(e) =>
                    setDraft({ ...draft, phone: e.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Industry">
              <select
                value={draft.industry}
                onChange={(e) =>
                  setDraft({ ...draft, industry: e.target.value })
                }
              >
                {[
                  "Corporate",
                  "Hospitality",
                  "Entertainment",
                  "Arts & culture",
                  "Private client",
                  "Other",
                ].map((i) => (
                  <option key={i}>{i}</option>
                ))}
              </select>
            </Field>
            <Field label="Internal notes">
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </Field>
            <div className="modal-actions">
              <Button
                variant="secondary"
                type="button"
                onClick={() => setDraft(null)}
              >
                Cancel
              </Button>
              <Button>Save client</Button>
            </div>
          </form>
        </Modal>
      )}
      {importing && (
        <CsvImportDialog
          title="Import clients from CSV"
          description="Rows are matched by email, or by name when there is no email. Nothing changes until you confirm."
          plan={(text) => planClientImport(text, data.clients, id)}
          label={(client: Client) => client.name}
          onCommit={async (plan) => {
            const updates = new Map(
              plan.updated.map((client) => [client.id, client]),
            );
            const saved = await update((workspace) => ({
              ...workspace,
              clients: [
                ...workspace.clients.map(
                  (client) => updates.get(client.id) ?? client,
                ),
                ...plan.created,
              ],
              activity: [
                activity(
                  "Client directory imported",
                  `${plan.created.length} nuevos · ${plan.updated.length} actualizados`,
                ),
                ...workspace.activity,
              ],
            }));
            if (saved) toast("Directorio de clientes importado.");
            return saved;
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  );
}
export function Venues() {
  const { data, update, toast } = useWorkspace();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Venue | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  return (
    <>
      <PageHeader
        title="Venues"
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus size={17} />
            Add venue
          </Button>
        }
      />
      <div className="directory-toolbar">
        <span>{data.venues.length} venues in your library</span>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search venues…"
        />
      </div>
      <div className="venue-grid">
        {data.venues
          .filter((v) =>
            `${v.name} ${v.city}`.toLowerCase().includes(search.toLowerCase()),
          )
          .map((v) => (
            <button
              className="venue-card"
              key={v.id}
              onClick={() => setSelected(v)}
            >
              <div className={`venue-art ${v.color}`}>
                <svg viewBox="0 0 300 150" aria-hidden="true">
                  <path
                    d="m40 100 110 36 110-58-110-36Z"
                    fill="currentColor"
                    opacity=".15"
                  />
                  <path
                    d="m65 90 85 28 85-45-85-28Z"
                    fill="none"
                    stroke="currentColor"
                  />
                  <path
                    d="M65 90V55l85 28 85-45v35M150 83v35M65 55l85-44 85 27"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                  <path
                    d="m90 76 60 20 60-32M90 64v12m30-1v11m30-4v14m30-29v13m30-29v13"
                    fill="none"
                    stroke="currentColor"
                    opacity=".5"
                  />
                </svg>
                <span>{v.category}</span>
              </div>
              <div className="venue-content">
                <h2>
                  {v.name}
                  <ArrowUpRight size={18} />
                </h2>
                <p>
                  <MapPin size={14} />
                  {v.city}
                </p>
                <div>
                  <span>
                    <LayersIcon />
                    {v.rooms.length} room{v.rooms.length !== 1 ? "s" : ""}
                  </span>
                  <span>
                    <Users size={14} />
                    {v.rooms.reduce((n, r) => n + r.capacity, 0)} capacity
                  </span>
                </div>
              </div>
            </button>
          ))}
      </div>
      {selected && (
        <Modal
          title={selected.name}
          description={`${selected.category} · ${selected.city}`}
          onClose={() => setSelected(null)}
          wide
        >
          <div className="modal-body">
            <Tabs
              items={["Rooms & dimensions"]}
              value="Rooms & dimensions"
              onChange={() => {}}
            />
            {selected.rooms.length === 0 && (
              <Empty
                title="Room details needed"
                description="Room and dimension editing will be connected with venue management."
              />
            )}
            {selected.rooms.map((r) => (
              <div className="room-row" key={r.id}>
                <Ruler size={24} />
                <div>
                  <h3>{r.name}</h3>
                  <p>
                    {r.width} × {r.depth} × {r.height} m · {r.capacity} guests
                  </p>
                </div>
                <Badge tone="amber">Unverified dimensions</Badge>
              </div>
            ))}
            <h3>Technical notes</h3>
            <p>{selected.notes || "No technical notes added yet."}</p>
            <h3>Related events</h3>
            {data.events
              .filter((e) => e.venueId === selected.id)
              .map((e) => (
                <Link key={e.id} className="simple-row" to={`/events/${e.id}`}>
                  <strong>{e.name}</strong>
                  <span>{shortDate(e.date)}</span>
                  <ArrowUpRight size={17} />
                </Link>
              ))}
          </div>
        </Modal>
      )}
      {adding && (
        <Modal title="Add a venue" onClose={() => setAdding(false)}>
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                !(await update((s) => ({
                  ...s,
                  venues: [
                    ...s.venues,
                    {
                      id: id(),
                      name,
                      city,
                      rooms: [],
                      notes: "",
                      color: "sage",
                      category: "Event venue",
                    },
                  ],
                })))
              )
                return;
              setAdding(false);
              setName("");
              setCity("");
              toast(
                "Venue added. Room measurements still need to be provided.",
              );
            }}
          >
            <Field label="Venue name">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="City / location">
              <input
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </Field>
            <div className="modal-actions">
              <Button>Add venue</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
function LayersIcon() {
  return <Ruler size={14} />;
}
