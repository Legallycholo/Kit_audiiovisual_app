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
  FileText,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  Printer,
  Copy,
  Check,
} from "lucide-react";
import { activity, useWorkspace } from "../shared/store";
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
  SearchField,
  Tabs,
} from "../shared/ui";
import {
  id,
  money,
  quoteTotals,
  createProposalRevision,
  shortDate,
} from "../shared/domain";
import type { Proposal } from "../shared/types";
import { useUnsavedChanges } from "../shared/useUnsavedChanges";
export function Proposals() {
  const { data, update, toast } = useWorkspace();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("All proposals");
  const [create, setCreate] = useState(false);
  const [ai, setAI] = useState(false);
  const [eventId, setEventId] = useState(
    params.get("event") || data.events[0]?.id || "",
  );
  function createDraft() {
    const event = data.events.find((e) => e.id === eventId);
    if (!event) return;
    const proposal: Proposal = {
      id: id(),
      number: `KIT-${new Date().getFullYear()}-${String(data.proposals.length + 1).padStart(3, "0")}`,
      eventId,
      version: 1,
      title: event.name,
      introduction: event.notes,
      terms:
        "Availability, payment terms, and final scope are subject to review.",
      lines: [],
      discount: 0,
      tax: 0,
      status: "Draft",
      validUntil: event.date,
    };
    update((s) => ({
      ...s,
      proposals: [...s.proposals, proposal],
      activity: [
        activity("Proposal draft created", proposal.number, eventId),
        ...s.activity,
      ],
    }));
    navigate(`/proposals/${proposal.id}`);
  }
  const filtered = data.proposals.filter(
    (p) =>
      `${p.number} ${p.title}`.toLowerCase().includes(search.toLowerCase()) &&
      (!params.get("event") || p.eventId === params.get("event")) &&
      (tab === "All proposals" ||
        (tab === "Review queue" ? p.status === "In review" : p.status === tab)),
  );
  return (
    <>
      <PageHeader
        eyebrow="TURN A GOOD IDEA INTO A YES"
        title="Proposals & quotations"
        description="Thoughtful proposals. Clear pricing. Every revision in one place."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreate(true);
                setAI(true);
              }}
            >
              <Sparkles size={17} />
              Draft with AI
            </Button>
            <Button
              onClick={() => {
                setCreate(true);
                setAI(false);
              }}
            >
              <Plus size={17} />
              New proposal
            </Button>
          </>
        }
      />
      <Panel>
        <div className="list-toolbar">
          <Tabs
            items={[
              "All proposals",
              "Draft",
              "Review queue",
              "Issued",
              "Accepted",
            ]}
            value={tab}
            onChange={setTab}
          />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search proposals…"
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Client</th>
                <th>Version</th>
                <th>Total</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const event = data.events.find((e) => e.id === p.eventId);
                const c = data.clients.find((c) => c.id === event?.clientId);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link className="record-cell" to={`/proposals/${p.id}`}>
                        <span className="document-icon">
                          <FileText size={21} />
                        </span>
                        <span>
                          <strong>{p.title}</strong>
                          <small>{p.number}</small>
                        </span>
                      </Link>
                    </td>
                    <td>{c?.name}</td>
                    <td>v{p.version}</td>
                    <td className="amount">
                      {money(quoteTotals(p.lines, p.discount, p.tax).total)}
                    </td>
                    <td>
                      <Badge>{p.status}</Badge>
                    </td>
                    <td>
                      <Link
                        className="icon-button"
                        to={`/proposals/${p.id}`}
                        aria-label={`Edit ${p.title}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <Empty
              title="A fresh page for your next proposal"
              description="Create a draft linked to an event, then build its scope and pricing."
            />
          )}
        </div>
      </Panel>
      {create && (
        <Modal
          title={ai ? "Draft with AI" : "Create a proposal"}
          description="Start with an event so your client, scope, and dates stay connected."
          onClose={() => setCreate(false)}
        >
          <div className="modal-body">
            <Field label="Event">
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
            {ai && (
              <>
                <Field label="What should this proposal include?">
                  <textarea
                    rows={4}
                    placeholder="Describe the event, equipment, creative direction, and any special requirements…"
                  />
                </Field>
                <div className="connection-note">
                  <Sparkles size={20} />
                  <div>
                    <strong>AI is not connected yet</strong>
                    <p>
                      The proposal workspace is ready. You can start a manual
                      draft using your event brief now.
                    </p>
                  </div>
                </div>
              </>
            )}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setCreate(false)}>
                Cancel
              </Button>
              <Button disabled={!eventId} onClick={createDraft}>
                {ai ? "Start a manual draft" : "Create draft"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function ProposalEditor() {
  const { proposalId } = useParams();
  const { data, update, toast } = useWorkspace();
  const navigate = useNavigate();
  const original = data.proposals.find((p) => p.id === proposalId);
  if (!original)
    return (
      <Empty
        title="Proposal not found"
        description="Return to proposals to select a record."
        action={<Link to="/proposals">All proposals</Link>}
      />
    );
  return <Editor key={original.id} original={original} />;
}
function Editor({ original }: { original: Proposal }) {
  const { data, update, toast } = useWorkspace();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Proposal>(() => structuredClone(original));
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [section, setSection] = useState("Introduction");
  const locked = ["Issued", "Accepted", "Declined", "Superseded"].includes(
    original.status,
  );
  const event = data.events.find((e) => e.id === draft.eventId);
  const client = data.clients.find((c) => c.id === event?.clientId);
  let totals = { subtotal: 0, discount: 0, tax: 0, total: 0 };
  try {
    totals = quoteTotals(draft.lines, draft.discount, draft.tax);
  } catch {
    /* Validation is reported on save. */
  }
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);
  useUnsavedChanges(dirty);
  function save(next = draft) {
    try {
      quoteTotals(next.lines, next.discount, next.tax);
      if (!next.title.trim()) throw new Error("A proposal title is required.");
      update((s) => ({
        ...s,
        proposals: s.proposals.map((p) => (p.id === next.id ? next : p)),
        activity: [
          activity(
            "Proposal saved",
            `${next.number} · revision ${next.version}`,
            next.eventId,
          ),
          ...s.activity,
        ],
      }));
      setDraft(next);
      setError("");
      toast("Proposal saved on this device.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function revision() {
    const result = createProposalRevision(data, original.id);
    const next = result.proposal;
    update(() => ({
      ...result.workspace,
      activity: [
        activity(
          "Proposal draft opened",
          `${next.number} · revision ${next.version}`,
          next.eventId,
        ),
        ...result.workspace.activity,
      ],
    }));
    navigate(`/proposals/${next.id}`);
    toast(
      "Draft revision opened. Earlier content and acceptance history are preserved.",
    );
  }
  return (
    <>
      <Link className="back-link" to="/proposals">
        <ArrowLeft size={15} />
        All proposals
      </Link>
      <PageHeader
        eyebrow={`${draft.number} · REVISION ${draft.version}`}
        title={draft.title}
        description={`${client?.name} · ${event ? shortDate(event.date) : ""}`}
        actions={
          <>
            <Badge>{original.status}</Badge>
            <Button variant="secondary" onClick={() => setPreview(true)}>
              <Printer size={16} />
              Preview
            </Button>
            {locked ? (
              <Button onClick={revision}>
                <Copy size={16} />
                New revision
              </Button>
            ) : (
              <Button onClick={() => save()}>
                <Save size={16} />
                Save changes
              </Button>
            )}
          </>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {locked && (
        <div className="info-note">
          This revision is {original.status.toLowerCase()} and preserved. Create
          a new revision to change its scope or pricing.
        </div>
      )}
      <div className="proposal-workspace">
        <aside className="proposal-outline">
          <span className="eyebrow">DOCUMENT SECTIONS</span>
          {[
            "Introduction",
            "Equipment & services",
            "Visuals",
            "Terms & details",
          ].map((s, i) => (
            <button
              className={section === s ? "active" : ""}
              onClick={() => setSection(s)}
              key={s}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {s}
            </button>
          ))}
          <div className="proposal-client">
            <Avatar label={client?.initials || "CL"} color={client?.color} />
            <strong>{client?.name}</strong>
            <small>{client?.contact}</small>
            <small>{client?.email}</small>
          </div>
          <div className="save-indicator">
            <span className={`mini-dot ${dirty ? "amber" : "green"}`} />
            {dirty ? "Unsaved changes" : "Saved revision"}
          </div>
        </aside>
        <Panel className="proposal-document">
          <div className="document-brand">
            <span className="brand-small">kit.</span>
            <span>AUDIOVISUAL EXPERIENCES</span>
          </div>
          <div className="document-caption">
            PREPARED FOR {client?.name.toUpperCase()}
          </div>
          {section === "Introduction" && (
            <div className="document-fields">
              <Field label="Proposal title">
                <input
                  className="title-input"
                  disabled={locked}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label="Introduction & event scope">
                <textarea
                  rows={9}
                  disabled={locked}
                  value={draft.introduction}
                  onChange={(e) =>
                    setDraft({ ...draft, introduction: e.target.value })
                  }
                />
              </Field>
              <div className="document-event">
                <CalendarDaysInline />
                <div>
                  <strong>{event?.name}</strong>
                  <p>
                    {event
                      ? `${shortDate(event.date)} – ${shortDate(event.endDate)}`
                      : ""}{" "}
                    · {event?.attendees} attendees
                  </p>
                </div>
              </div>
            </div>
          )}
          {section === "Equipment & services" && (
            <div className="document-fields">
              <h2>Equipment & services</h2>
              <p className="muted">
                Rate × quantity × rental days. Prices are saved with this
                revision.
              </p>
              <div className="quote-lines">
                {draft.lines.map((line, i) => (
                  <div className="quote-line" key={line.id}>
                    <Field label={`Item ${i + 1}`}>
                      <input
                        disabled={locked}
                        value={line.description}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            lines: draft.lines.map((l) =>
                              l.id === line.id
                                ? { ...l, description: e.target.value }
                                : l,
                            ),
                          })
                        }
                      />
                    </Field>
                    <div className="quote-line-values">
                      {(["quantity", "rate", "days"] as const).map((key) => (
                        <Field
                          key={key}
                          label={
                            key === "rate"
                              ? "Rate · USD"
                              : key === "quantity"
                                ? "Quantity"
                                : "Days"
                          }
                        >
                          <input
                            aria-label={`${line.description} ${key}`}
                            disabled={locked}
                            type="number"
                            min="0"
                            step={key === "rate" ? ".01" : "1"}
                            value={line[key]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                lines: draft.lines.map((l) =>
                                  l.id === line.id
                                    ? { ...l, [key]: Number(e.target.value) }
                                    : l,
                                ),
                              })
                            }
                          />
                        </Field>
                      ))}
                      <strong>
                        {money(line.quantity * line.rate * line.days)}
                      </strong>
                      {!locked && (
                        <button
                          className="icon-button"
                          aria-label={`Remove ${line.description}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              lines: draft.lines.filter(
                                (l) => l.id !== line.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!locked && (
                <div className="add-line-row">
                  <select
                    aria-label="Add equipment from catalog"
                    value=""
                    onChange={(e) => {
                      const item = data.equipment.find(
                        (q) => q.id === e.target.value,
                      );
                      if (item)
                        setDraft({
                          ...draft,
                          lines: [
                            ...draft.lines,
                            {
                              id: id(),
                              equipmentId: item.id,
                              description: item.name,
                              quantity: 1,
                              rate: item.rate,
                              days: 1,
                            },
                          ],
                        });
                    }}
                  >
                    <option value="">+ Add from equipment catalog</option>
                    {data.equipment.map((q) => (
                      <option value={q.id} key={q.id}>
                        {q.name} · {money(q.rate)}/day
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        lines: [
                          ...draft.lines,
                          {
                            id: id(),
                            description: "Additional service",
                            quantity: 1,
                            rate: 0,
                            days: 1,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    Custom line
                  </Button>
                </div>
              )}
            </div>
          )}
          {section === "Visuals" && (
            <Empty
              title="Give your proposal a visual story"
              description="Layout snapshots, 3D views, and reviewed creative assets will be insertable here as their export workflows are connected."
              action={
                <Link
                  className="button secondary"
                  to={`/design?event=${event?.id}`}
                >
                  Open event design
                </Link>
              }
            />
          )}
          {section === "Terms & details" && (
            <div className="document-fields">
              <Field label="Terms, exclusions & payment conditions">
                <textarea
                  disabled={locked}
                  rows={8}
                  value={draft.terms}
                  onChange={(e) =>
                    setDraft({ ...draft, terms: e.target.value })
                  }
                />
              </Field>
              <Field label="Valid until">
                <input
                  type="date"
                  disabled={locked}
                  value={draft.validUntil}
                  onChange={(e) =>
                    setDraft({ ...draft, validUntil: e.target.value })
                  }
                />
              </Field>
            </div>
          )}
        </Panel>
        <aside className="proposal-summary">
          <Panel title="Quotation summary">
            <div className="panel-body">
              <div className="summary-line">
                <span>Subtotal</span>
                <strong>{money(totals.subtotal)}</strong>
              </div>
              <div className="form-grid">
                <Field label="Discount %">
                  <input
                    disabled={locked}
                    type="number"
                    min="0"
                    max="100"
                    value={draft.discount}
                    onChange={(e) =>
                      setDraft({ ...draft, discount: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Tax %">
                  <input
                    disabled={locked}
                    type="number"
                    min="0"
                    max="100"
                    step=".01"
                    value={draft.tax}
                    onChange={(e) =>
                      setDraft({ ...draft, tax: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <div className="summary-line muted">
                <span>Discount</span>
                <span>−{money(totals.discount)}</span>
              </div>
              <div className="summary-line muted">
                <span>Tax</span>
                <span>{money(totals.tax)}</span>
              </div>
              <div className="summary-total">
                <span>Total · USD</span>
                <strong>{money(totals.total)}</strong>
              </div>
              <p className="tiny muted">
                Tax treatment and commercial terms require business review.
                Quoted equipment is not automatically reserved.
              </p>
              {!locked && (
                <Button
                  variant="secondary"
                  onClick={() => save({ ...draft, status: "In review" })}
                >
                  <Check size={16} />
                  Submit for internal review
                </Button>
              )}
              <Button disabled={dirty} onClick={() => setSending(true)}>
                <Send size={15} />
                Review & send
              </Button>
              {dirty && (
                <small>
                  Save changes before reviewing the outgoing proposal.
                </small>
              )}
            </div>
          </Panel>
        </aside>
      </div>
      {sending && (
        <Modal
          title="Owner review · outgoing proposal"
          description="Every client message requires your confirmation."
          onClose={() => setSending(false)}
        >
          <div className="modal-body">
            <div className="detail-facts">
              <div>
                <span>Recipient</span>
                <strong>
                  {client?.contact} · {client?.phone}
                </strong>
              </div>
              <div>
                <span>Exact revision</span>
                <strong>
                  {draft.number} · v{draft.version}
                </strong>
              </div>
              <div>
                <span>Total</span>
                <strong>{money(totals.total)}</strong>
              </div>
            </div>
            <Field label="Message to client">
              <textarea
                rows={4}
                defaultValue={`Hi ${client?.contact.split(" ")[0]}, please review the attached proposal for ${event?.name}. Let us know if you have any questions.`}
              />
            </Field>
            <div className="connection-note">
              <Send size={20} />
              <div>
                <strong>WhatsApp is not connected</strong>
                <p>
                  No message will be sent. Your proposal stays available in the
                  app while the messaging integration is added.
                </p>
              </div>
            </div>
            <Button disabled>Confirm & send · connection required</Button>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal
          title="Proposal preview"
          description="Print this review copy or save it as a PDF using your browser."
          onClose={() => setPreview(false)}
          wide
        >
          <div className="print-proposal">
            <span className="brand-small">kit.</span>
            <p>{data.settings.company}</p>
            <h1>{draft.title}</h1>
            <p>
              {draft.number} · Revision {draft.version} · {draft.status}
            </p>
            <hr />
            <h3>Prepared for {client?.name}</h3>
            <p>{draft.introduction}</p>
            <table>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Days</th>
                  <th>Rate</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.description}</td>
                    <td>{l.quantity}</td>
                    <td>{l.days}</td>
                    <td>{money(l.rate)}</td>
                    <td>{money(l.quantity * l.rate * l.days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="print-totals">
              <p>Subtotal: {money(totals.subtotal)}</p>
              <p>Discount: −{money(totals.discount)}</p>
              <p>Tax: {money(totals.tax)}</p>
              <h2>Total: {money(totals.total)}</h2>
            </div>
            <h3>Terms</h3>
            <p>{draft.terms}</p>
            <p>Valid until {draft.validUntil}</p>
            <p className="tiny">Sample workspace · review copy</p>
          </div>
          <div className="modal-actions no-print">
            <Button onClick={() => window.print()}>
              <Printer size={16} />
              Print / save PDF
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
function CalendarDaysInline() {
  return <FileText size={23} />;
}
