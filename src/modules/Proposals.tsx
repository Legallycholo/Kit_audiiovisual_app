import { sameValue } from "../shared/value";
import { uiLabel } from "../shared/i18n";
import { ProposalAI, AIReview, type DraftSuggestion } from "./ProposalAI";
import { canEditCollection } from "../shared/access";
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
  Image as ImageIcon,
  Boxes,
  GitCompare,
  ArrowUp,
  ArrowDown,
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
import {
  createCreativeProposalVisual,
  createLayoutProposalVisual,
  createVisualNarrative,
} from "../shared/proposal-visuals";
import { useUnsavedChanges } from "../shared/useUnsavedChanges";
export function Proposals() {
  const { data, update, toast, user, mode, saving } = useWorkspace();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("All proposals");
  const [create, setCreate] = useState(false);
  const [ai, setAI] = useState(false);
  const [eventId, setEventId] = useState(
    params.get("event") || data.events[0]?.id || "",
  );
  async function createDraft(suggestion?: DraftSuggestion) {
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
        "La disponibilidad, las condiciones de pago y el alcance final están sujetos a revisión.",
      lines: [],
      discount: 0,
      tax: 0,
      status: "Draft",
      validUntil: event.date,
      ...suggestion,
    };
    if (
      !(await update((s) => ({
        ...s,
        proposals: [...s.proposals, proposal],
        activity: [
          activity("Proposal draft created", proposal.number, eventId),
          ...s.activity,
        ],
      })))
    )
      return;
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
        eyebrow={uiLabel("TURN A GOOD IDEA INTO A YES")}
        title={uiLabel("Proposals & quotations")}
        description={uiLabel(
          "Thoughtful proposals. Clear pricing. Every revision in one place.",
        )}
        actions={
          canEditCollection(user, "proposals") ? (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  setCreate(true);
                  setAI(true);
                }}
              >
                <Sparkles size={17} />
                {uiLabel("Draft with AI")}
              </Button>
              <Button
                onClick={() => {
                  setCreate(true);
                  setAI(false);
                }}
              >
                <Plus size={17} />
                {uiLabel("New proposal")}
              </Button>
            </>
          ) : undefined
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
            placeholder={uiLabel("Search proposals\u2026")}
          />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{uiLabel("Proposal")}</th>
                <th>{uiLabel("Client")}</th>
                <th>{uiLabel("Version")}</th>
                <th>{uiLabel("Total")}</th>
                <th>{uiLabel("Status")}</th>
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
              title={uiLabel("A fresh page for your next proposal")}
              description={uiLabel(
                "Create a draft linked to an event, then build its scope and pricing.",
              )}
            />
          )}
        </div>
      </Panel>
      {create && (
        <Modal
          title={ai ? uiLabel("Draft with AI") : uiLabel("Create a proposal")}
          description={uiLabel(
            "Start with an event so your client, scope, and dates stay connected.",
          )}
          onClose={() => setCreate(false)}
        >
          <div className="modal-body">
            <Field label={uiLabel("Event")}>
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
              <ProposalAI
                key={eventId}
                eventId={eventId}
                onApply={createDraft}
              />
            )}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setCreate(false)}>
                {uiLabel("Cancel")}
              </Button>
              <Button disabled={!eventId} onClick={() => createDraft()}>
                {ai ? uiLabel("Start a manual draft") : uiLabel("Create draft")}
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
  const { data, update, toast, user, mode, saving } = useWorkspace();
  const navigate = useNavigate();
  const original = data.proposals.find((p) => p.id === proposalId);
  if (!original)
    return (
      <Empty
        title={uiLabel("Proposal not found")}
        description={uiLabel("Return to proposals to select a record.")}
        action={<Link to="/proposals">{uiLabel("All proposals")}</Link>}
      />
    );
  return <Editor key={original.id} original={original} />;
}
function Editor({ original }: { original: Proposal }) {
  const { data, update, toast, user, mode, saving } = useWorkspace();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Proposal>(() => structuredClone(original));
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [outgoingMessage, setOutgoingMessage] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [section, setSection] = useState("Introduction");
  const editable = canEditCollection(user, "proposals");
  const locked =
    !editable ||
    ["Issued", "Accepted", "Declined", "Superseded"].includes(original.status);
  const event = data.events.find((e) => e.id === draft.eventId);
  const client = data.clients.find((c) => c.id === event?.clientId);
  const family = data.proposals
    .filter((proposal) => proposal.number === draft.number)
    .sort((a, b) => a.version - b.version);
  const priorVersions = family.filter(
    (proposal) => proposal.version < draft.version,
  );
  const comparison =
    data.proposals.find((proposal) => proposal.id === compareId) ||
    priorVersions.at(-1);
  const creativeOptions = data.creativeAssets.filter(
    (asset) => asset.eventId === draft.eventId && asset.status === "Approved",
  );
  const layoutOptions = data.layouts.filter(
    (layout) => layout.eventId === draft.eventId,
  );
  let totals = { subtotal: 0, discount: 0, tax: 0, total: 0 };
  try {
    totals = quoteTotals(draft.lines, draft.discount, draft.tax);
  } catch {
    /* Validation is reported on save. */
  }
  let comparisonTotal = 0;
  if (comparison)
    try {
      comparisonTotal = quoteTotals(
        comparison.lines,
        comparison.discount,
        comparison.tax,
      ).total;
    } catch {
      /* Historical validation remains visible through its saved values. */
    }
  const dirty = !sameValue(draft, original);
  useUnsavedChanges(dirty, () => save());
  const addCreativeVisual = (assetId: string) => {
    const asset = creativeOptions.find((item) => item.id === assetId);
    if (!asset) return;
    if ((draft.visuals || []).length >= 12) {
      setError("La propuesta admite un máximo de 12 recursos visuales.");
      return;
    }
    if (
      draft.visuals?.some(
        (visual) =>
          visual.sourceType === "Creative" &&
          visual.sourceId === asset.id &&
          visual.sourceRevision === asset.revision,
      )
    )
      return;
    const visual = createCreativeProposalVisual({
      id: id(),
      asset,
      addedAt: new Date().toISOString(),
    });
    setDraft({
      ...draft,
      status: "Draft",
      creativeAssetIds: [
        ...new Set([...(draft.creativeAssetIds || []), asset.id]),
      ],
      visuals: [...(draft.visuals || []), visual],
    });
    setError("");
  };
  const addLayoutVisual = (
    layoutId: string,
    view: "Layout plan" | "Layout 3D",
  ) => {
    const layout = layoutOptions.find((item) => item.id === layoutId);
    if (!layout) return;
    if ((draft.visuals || []).length >= 12) {
      setError("La propuesta admite un máximo de 12 recursos visuales.");
      return;
    }
    if (
      draft.visuals?.some(
        (visual) =>
          visual.sourceType === view &&
          visual.sourceId === layout.id &&
          visual.sourceRevision === layout.version,
      )
    )
      return;
    try {
      const visual = createLayoutProposalVisual({
        id: id(),
        layout,
        view,
        addedAt: new Date().toISOString(),
      });
      setDraft({
        ...draft,
        status: "Draft",
        visuals: [...(draft.visuals || []), visual],
      });
      setError("");
    } catch (caught) {
      setError((caught as Error).message);
    }
  };
  const updateVisual = (
    visualId: string,
    values: { caption?: string; altText?: string },
  ) =>
    setDraft({
      ...draft,
      status: "Draft",
      visuals: (draft.visuals || []).map((visual) =>
        visual.id === visualId ? { ...visual, ...values } : visual,
      ),
    });
  const removeVisual = (visualId: string) => {
    const removed = draft.visuals?.find((visual) => visual.id === visualId);
    const visuals = (draft.visuals || []).filter(
      (visual) => visual.id !== visualId,
    );
    const stillUsed = removed
      ? visuals.some(
          (visual) =>
            visual.sourceType === "Creative" &&
            visual.sourceId === removed.sourceId,
        )
      : false;
    setDraft({
      ...draft,
      status: "Draft",
      visuals,
      creativeAssetIds:
        removed?.sourceType === "Creative" && !stillUsed
          ? (draft.creativeAssetIds || []).filter(
              (assetId) => assetId !== removed.sourceId,
            )
          : draft.creativeAssetIds,
    });
  };
  const moveVisual = (visualId: string, direction: -1 | 1) => {
    const visuals = [...(draft.visuals || [])];
    const from = visuals.findIndex((visual) => visual.id === visualId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= visuals.length) return;
    [visuals[from], visuals[to]] = [visuals[to], visuals[from]];
    setDraft({ ...draft, status: "Draft", visuals });
  };
  async function save(next = draft) {
    try {
      if (
        original.status === "Ready to send" &&
        next.status === "Ready to send" &&
        !sameValue(next, original)
      )
        next = { ...next, status: "Draft" };
      quoteTotals(next.lines, next.discount, next.tax);
      if (!next.title.trim())
        throw new Error("La propuesta necesita un título.");
      if (next.visuals?.some((visual) => !visual.altText.trim()))
        throw new Error(
          "Cada recurso visual necesita texto alternativo antes de guardar.",
        );
      if (
        !(await update((s) => ({
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
        })))
      )
        return;
      setDraft(next);
      setError("");
      toast("Propuesta guardada en este dispositivo.");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function revision() {
    const result = createProposalRevision(data, original.id);
    const next = result.proposal;
    if (
      !(await update(() => ({
        ...result.workspace,
        activity: [
          activity(
            "Proposal draft opened",
            `${next.number} · revision ${next.version}`,
            next.eventId,
          ),
          ...result.workspace.activity,
        ],
      })))
    )
      return;
    navigate(`/proposals/${next.id}`);
    toast(
      "Nueva versión abierta. Las versiones y aceptaciones anteriores se conservan.",
    );
  }
  async function prepareOutgoingMessage() {
    if (!client || !outgoingMessage.trim()) return;
    const existingConversation = data.conversations.find(
      (conversation) =>
        conversation.eventId === draft.eventId &&
        conversation.proposalId === draft.id &&
        conversation.proposalVersion === draft.version,
    );
    const conversationId = existingConversation?.id || id();
    const message = {
      id: id(),
      direction: "out" as const,
      text: outgoingMessage.trim(),
      at: new Date().toISOString(),
      proposalId: draft.id,
      proposalVersion: draft.version,
      status: "Draft" as const,
    };
    const ready: Proposal = { ...draft, status: "Ready to send" };
    if (
      !(await update((workspace) => ({
        ...workspace,
        proposals: workspace.proposals.map((proposal) =>
          proposal.id === ready.id ? ready : proposal,
        ),
        conversations: existingConversation
          ? workspace.conversations.map((conversation) =>
              conversation.id === conversationId
                ? {
                    ...conversation,
                    messages: [...conversation.messages, message],
                  }
                : conversation,
            )
          : [
              ...workspace.conversations,
              {
                id: conversationId,
                clientId: client.id,
                eventId: draft.eventId,
                proposalId: draft.id,
                proposalVersion: draft.version,
                review: "None" as const,
                messages: [message],
              },
            ],
        activity: [
          activity(
            "Outgoing proposal message prepared",
            `${draft.number} · revision ${draft.version}`,
            draft.eventId,
          ),
          ...workspace.activity,
        ],
      })))
    )
      return;
    setDraft(ready);
    setSending(false);
    navigate(`/inbox?conversation=${conversationId}`);
    toast(
      "Mensaje preparado para revisión del propietario. No se envió todavía.",
    );
  }
  return (
    <>
      <Link className="back-link" to="/proposals">
        <ArrowLeft size={15} />
        {uiLabel("All proposals")}
      </Link>
      <PageHeader
        eyebrow={`${draft.number} · VERSIÓN ${draft.version}`}
        title={draft.title}
        description={`${client?.name} · ${event ? shortDate(event.date) : ""}`}
        actions={
          <>
            <Badge>{original.status}</Badge>
            <Button
              variant="secondary"
              disabled={dirty}
              title={
                dirty
                  ? "Guarda los cambios para previsualizar la versión exacta."
                  : undefined
              }
              onClick={() => setPreview(true)}
            >
              <Printer size={16} />
              {uiLabel("Preview")}
            </Button>
            {priorVersions.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setCompareId(priorVersions.at(-1)?.id || "");
                  setCompareOpen(true);
                }}
              >
                <GitCompare size={16} />
                Comparar versiones
              </Button>
            )}
            {editable &&
              (locked ? (
                <Button disabled={saving} onClick={revision}>
                  <Copy size={16} />
                  {uiLabel("New revision")}
                </Button>
              ) : (
                <Button disabled={saving} onClick={() => save()}>
                  <Save size={16} />
                  {uiLabel("Save changes")}
                </Button>
              ))}
          </>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {locked && (
        <div className="info-note">
          Esta versión se conserva como registro.{" "}
          {editable
            ? "Crea una nueva versión para cambiar su alcance o precios."
            : "Tu acceso a esta propuesta es de solo lectura."}
        </div>
      )}
      {!locked && (
        <div className="proposal-ai-actions">
          <Button variant="secondary" onClick={() => setAiOpen(true)}>
            <Sparkles size={16} />
            Mejorar con IA
          </Button>
        </div>
      )}
      <AIReview review={draft.aiReview} />
      <div className="proposal-workspace">
        <aside className="proposal-outline">
          <span className="eyebrow">{uiLabel("DOCUMENT SECTIONS")}</span>
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
              {uiLabel(s)}
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
            {dirty ? uiLabel("Unsaved changes") : uiLabel("Saved revision")}
          </div>
        </aside>
        <Panel className="proposal-document">
          <div className="document-brand">
            <span className="brand-small">kit.</span>
            <span>{uiLabel("AUDIOVISUAL EXPERIENCES")}</span>
          </div>
          <div className="document-caption">
            {uiLabel("PREPARED FOR")} {client?.name.toUpperCase()}
          </div>
          {section === "Introduction" && (
            <div className="document-fields">
              <Field label={uiLabel("Proposal title")}>
                <input
                  className="title-input"
                  disabled={locked}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label={uiLabel("Introduction & event scope")}>
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
                    · {event?.attendees} asistentes
                  </p>
                </div>
              </div>
            </div>
          )}
          {section === "Equipment & services" && (
            <div className="document-fields">
              <h2>{uiLabel("Equipment & services")}</h2>
              <p className="muted">
                {uiLabel(
                  "Rate \u00D7 quantity \u00D7 rental days. Prices are saved with this revision.",
                )}
              </p>
              <div className="quote-lines">
                {draft.lines.map((line, i) => (
                  <div className="quote-line" key={line.id}>
                    <Field label={`Partida ${i + 1}`}>
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
                              ? uiLabel("Rate · USD")
                              : key === "quantity"
                                ? uiLabel("Quantity")
                                : uiLabel("Days")
                          }
                        >
                          <input
                            aria-label={`${line.description} ${uiLabel(key === "rate" ? "Rate" : key === "days" ? "Days" : "Quantity")}`}
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
                    aria-label={uiLabel("Add equipment from catalog")}
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
                    <option value="">
                      {uiLabel("+ Add from equipment catalog")}
                    </option>
                    {data.equipment.map((q) => (
                      <option value={q.id} key={q.id}>
                        {q.name} · {money(q.rate)}/día
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
                    {uiLabel("Custom line")}
                  </Button>
                </div>
              )}
            </div>
          )}
          {section === "Visuals" && (
            <div className="proposal-visual-editor">
              <div className="proposal-visual-settings">
                <Field label="Plantilla de presentación">
                  <select
                    disabled={locked}
                    value={draft.presentationTemplate || "Editorial"}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: "Draft",
                        presentationTemplate: event.target.value as
                          "Minimal" | "Editorial" | "Spotlight",
                      })
                    }
                  >
                    <option value="Minimal">Minimalista</option>
                    <option value="Editorial">Editorial</option>
                    <option value="Spotlight">Protagonista</option>
                  </select>
                </Field>
                <Field label="Narrativa visual">
                  <textarea
                    rows={4}
                    disabled={locked}
                    value={draft.visualNarrative || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: "Draft",
                        visualNarrative: event.target.value,
                      })
                    }
                    placeholder="Explica cómo la propuesta visual apoya la experiencia del evento…"
                  />
                </Field>
                {!locked && (
                  <Button
                    variant="secondary"
                    disabled={!(draft.visuals || []).length}
                    onClick={() => {
                      try {
                        setDraft({
                          ...draft,
                          status: "Draft",
                          visualNarrative: createVisualNarrative(
                            event?.name || draft.title,
                            draft.visuals || [],
                          ),
                        });
                        setError("");
                      } catch (caught) {
                        setError((caught as Error).message);
                      }
                    }}
                  >
                    <Sparkles size={15} />
                    Crear borrador narrativo local
                  </Button>
                )}
              </div>
              {!locked && (
                <div className="proposal-media-picker">
                  <div>
                    <strong>Conceptos creativos aprobados</strong>
                    {creativeOptions.length ? (
                      creativeOptions.map((asset) => {
                        const added = draft.visuals?.some(
                          (visual) =>
                            visual.sourceType === "Creative" &&
                            visual.sourceId === asset.id &&
                            visual.sourceRevision === asset.revision,
                        );
                        return (
                          <div className="proposal-media-option" key={asset.id}>
                            <img src={asset.dataUrl} alt="" />
                            <span>
                              <b>{asset.title}</b>
                              <small>
                                Revisión {asset.revision} · aprobada
                              </small>
                            </span>
                            <Button
                              variant="secondary"
                              disabled={added}
                              onClick={() => addCreativeVisual(asset.id)}
                            >
                              <ImageIcon size={14} />
                              {added ? "Añadido" : "Añadir"}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p>
                        No hay conceptos aprobados para este evento. Revisa los
                        conceptos en el Estudio creativo.
                      </p>
                    )}
                  </div>
                  <div>
                    <strong>Diseños del evento</strong>
                    {layoutOptions.length ? (
                      layoutOptions.map((layout) => (
                        <div className="proposal-media-option" key={layout.id}>
                          <span className="proposal-layout-icon">
                            <Boxes size={20} />
                          </span>
                          <span>
                            <b>{layout.name}</b>
                            <small>
                              Revisión {layout.version} ·{" "}
                              {layout.verified
                                ? "medidas verificadas"
                                : "medidas no verificadas"}
                            </small>
                          </span>
                          <div className="proposal-media-option-actions">
                            <Button
                              variant="secondary"
                              disabled={draft.visuals?.some(
                                (visual) =>
                                  visual.sourceType === "Layout plan" &&
                                  visual.sourceId === layout.id &&
                                  visual.sourceRevision === layout.version,
                              )}
                              onClick={() =>
                                addLayoutVisual(layout.id, "Layout plan")
                              }
                            >
                              Añadir 2D
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={draft.visuals?.some(
                                (visual) =>
                                  visual.sourceType === "Layout 3D" &&
                                  visual.sourceId === layout.id &&
                                  visual.sourceRevision === layout.version,
                              )}
                              onClick={() =>
                                addLayoutVisual(layout.id, "Layout 3D")
                              }
                            >
                              Añadir 3D
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>
                        Este evento todavía no tiene un diseño. Ábrelo en el
                        Estudio de diseño para crear uno.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {(draft.visuals || []).length ? (
                <div className="proposal-visual-list">
                  {(draft.visuals || []).map((visual, index) => (
                    <article className="proposal-visual-card" key={visual.id}>
                      <img src={visual.dataUrl} alt={visual.altText} />
                      <div>
                        <div className="proposal-visual-heading">
                          <span>
                            <strong>{visual.title}</strong>
                            <small>
                              {visual.sourceType} · revisión{" "}
                              {visual.sourceRevision}
                              {visual.measurementStatus === "Unverified"
                                ? " · medidas no verificadas"
                                : ""}
                            </small>
                          </span>
                          {!locked && (
                            <span className="proposal-visual-controls">
                              <button
                                className="icon-button"
                                aria-label={`Mover ${visual.title} hacia arriba`}
                                disabled={index === 0}
                                onClick={() => moveVisual(visual.id, -1)}
                              >
                                <ArrowUp size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Mover ${visual.title} hacia abajo`}
                                disabled={
                                  index === (draft.visuals || []).length - 1
                                }
                                onClick={() => moveVisual(visual.id, 1)}
                              >
                                <ArrowDown size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Quitar ${visual.title}`}
                                onClick={() => removeVisual(visual.id)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </span>
                          )}
                        </div>
                        <Field label={`Pie de imagen · ${index + 1}`}>
                          <textarea
                            rows={2}
                            disabled={locked}
                            value={visual.caption}
                            onChange={(event) =>
                              updateVisual(visual.id, {
                                caption: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label={`Texto alternativo · ${index + 1}`}>
                          <input
                            disabled={locked}
                            value={visual.altText}
                            onChange={(event) =>
                              updateVisual(visual.id, {
                                altText: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title={uiLabel("Give your proposal a visual story")}
                  description="Añade un concepto aprobado o una captura del diseño del evento. Cada recurso queda guardado con esta versión de la propuesta."
                  action={
                    <Link
                      className="button secondary"
                      to={`/design?event=${event?.id}`}
                    >
                      {uiLabel("Open event design")}
                    </Link>
                  }
                />
              )}
            </div>
          )}
          {section === "Terms & details" && (
            <div className="document-fields">
              <Field label={uiLabel("Terms, exclusions & payment conditions")}>
                <textarea
                  disabled={locked}
                  rows={8}
                  value={draft.terms}
                  onChange={(e) =>
                    setDraft({ ...draft, terms: e.target.value })
                  }
                />
              </Field>
              <Field label={uiLabel("Valid until")}>
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
          <Panel title={uiLabel("Quotation summary")}>
            <div className="panel-body">
              <div className="summary-line">
                <span>Subtotal</span>
                <strong>{money(totals.subtotal)}</strong>
              </div>
              <div className="form-grid">
                <Field label={uiLabel("Discount %")}>
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
                <Field label={uiLabel("Tax %")}>
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
                <span>{uiLabel("Discount")}</span>
                <span>−{money(totals.discount)}</span>
              </div>
              <div className="summary-line muted">
                <span>{uiLabel("Tax")}</span>
                <span>{money(totals.tax)}</span>
              </div>
              <div className="summary-total">
                <span>{uiLabel("Total \u00B7 USD")}</span>
                <strong>{money(totals.total)}</strong>
              </div>
              <p className="tiny muted">
                Los impuestos y términos comerciales requieren revisión. Los
                equipos cotizados no se reservan automáticamente.
              </p>
              {!locked && (
                <Button
                  variant="secondary"
                  onClick={() => save({ ...draft, status: "In review" })}
                >
                  <Check size={16} />
                  {uiLabel("Submit for internal review")}
                </Button>
              )}
              <Button
                disabled={dirty || Boolean(user && !user.isOwner)}
                onClick={() => {
                  setOutgoingMessage(
                    `Hola ${client?.contact.split(" ")[0]}, te compartimos la propuesta para ${event?.name}. Quedamos atentos a tus preguntas.`,
                  );
                  setSending(true);
                }}
              >
                <Send size={15} />
                {uiLabel("Review & send")}
              </Button>
              {dirty && (
                <small>
                  {uiLabel(
                    "Save changes before reviewing the outgoing proposal.",
                  )}
                </small>
              )}
            </div>
          </Panel>
        </aside>
      </div>
      {aiOpen && (
        <Modal
          wide
          title="Mejorar propuesta con IA"
          description="Genera y revisa una sugerencia antes de reemplazar contenido."
          onClose={() => setAiOpen(false)}
        >
          <div className="modal-body">
            <ProposalAI
              eventId={draft.eventId}
              existing={draft}
              onApply={(suggestion) => {
                setDraft({ ...draft, ...suggestion, status: "Draft" });
                setAiOpen(false);
              }}
            />
          </div>
        </Modal>
      )}
      {sending && (
        <Modal
          title={uiLabel("Owner review \u00B7 outgoing proposal")}
          description={uiLabel(
            "Every client message requires your confirmation.",
          )}
          onClose={() => setSending(false)}
        >
          <div className="modal-body">
            <div className="detail-facts">
              <div>
                <span>{uiLabel("Recipient")}</span>
                <strong>
                  {client?.contact} · {client?.phone}
                </strong>
              </div>
              <div>
                <span>{uiLabel("Exact revision")}</span>
                <strong>
                  {draft.number} · v{draft.version}
                </strong>
              </div>
              <div>
                <span>{uiLabel("Total")}</span>
                <strong>{money(totals.total)}</strong>
              </div>
            </div>
            <Field label={uiLabel("Message to client")}>
              <textarea
                rows={4}
                value={outgoingMessage}
                onChange={(event) => setOutgoingMessage(event.target.value)}
              />
            </Field>
            <div className="connection-note">
              <Send size={20} />
              <div>
                <strong>Revisión antes del envío</strong>
                <p>
                  El mensaje se guardará con esta versión exacta y se abrirá en
                  Mensajes de clientes. El envío requiere una segunda
                  confirmación del propietario.
                </p>
              </div>
            </div>
            <Button
              disabled={!outgoingMessage.trim()}
              onClick={prepareOutgoingMessage}
            >
              Preparar en mensajes
            </Button>
          </div>
        </Modal>
      )}
      {compareOpen && comparison && (
        <Modal
          wide
          title="Comparar versiones"
          description={`${draft.number} · la comparación no modifica ninguna versión`}
          onClose={() => setCompareOpen(false)}
        >
          <div className="modal-body revision-comparison">
            <Field label="Versión anterior">
              <select
                value={comparison.id}
                onChange={(event) => setCompareId(event.target.value)}
              >
                {priorVersions.map((proposal) => (
                  <option value={proposal.id} key={proposal.id}>
                    Versión {proposal.version} · {uiLabel(proposal.status)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="revision-comparison-grid">
              <div>
                <span>Versión {comparison.version}</span>
                <strong>{comparison.title}</strong>
                <small>{uiLabel(comparison.status)}</small>
              </div>
              <div>
                <span>Versión {draft.version}</span>
                <strong>{draft.title}</strong>
                <small>{uiLabel(draft.status)}</small>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Elemento</th>
                  <th>Versión {comparison.version}</th>
                  <th>Versión {draft.version}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total</td>
                  <td>{money(comparisonTotal)}</td>
                  <td>{money(totals.total)}</td>
                </tr>
                <tr>
                  <td>Partidas</td>
                  <td>{comparison.lines.length}</td>
                  <td>{draft.lines.length}</td>
                </tr>
                <tr>
                  <td>Descuento / impuesto</td>
                  <td>
                    {comparison.discount}% / {comparison.tax}%
                  </td>
                  <td>
                    {draft.discount}% / {draft.tax}%
                  </td>
                </tr>
                <tr>
                  <td>Recursos visuales</td>
                  <td>{comparison.visuals?.length || 0}</td>
                  <td>{draft.visuals?.length || 0}</td>
                </tr>
              </tbody>
            </table>
            <div className="revision-change-list">
              <strong>Cambios de alcance visibles</strong>
              {draft.lines
                .filter(
                  (line) =>
                    !comparison.lines.some(
                      (previous) => previous.description === line.description,
                    ),
                )
                .map((line) => (
                  <span key={line.id}>+ {line.description}</span>
                ))}
              {comparison.lines
                .filter(
                  (line) =>
                    !draft.lines.some(
                      (current) => current.description === line.description,
                    ),
                )
                .map((line) => (
                  <span key={line.id}>− {line.description}</span>
                ))}
              {draft.visuals
                ?.filter(
                  (visual) =>
                    !comparison.visuals?.some(
                      (previous) =>
                        previous.sourceType === visual.sourceType &&
                        previous.sourceId === visual.sourceId &&
                        previous.sourceRevision === visual.sourceRevision,
                    ),
                )
                .map((visual) => (
                  <span key={visual.id}>+ {visual.title}</span>
                ))}
              {draft.lines.length === comparison.lines.length &&
                (draft.visuals?.length || 0) ===
                  (comparison.visuals?.length || 0) && (
                  <small>
                    Revisa también los cambios de texto, cantidades y precios
                    mostrados arriba.
                  </small>
                )}
            </div>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal
          title={uiLabel("Proposal preview")}
          description={uiLabel(
            "Print this review copy or save it as a PDF using your browser.",
          )}
          onClose={() => setPreview(false)}
          wide
        >
          <div
            className={`print-proposal template-${(draft.presentationTemplate || "Editorial").toLowerCase()}`}
          >
            <header className="print-proposal-cover">
              <span className="brand-small">kit.</span>
              <p>{data.settings.company}</p>
              <h1>{draft.title}</h1>
              <p>
                {draft.number} · Versión {draft.version} ·{" "}
                {uiLabel(draft.status)}
              </p>
            </header>
            <hr />
            <h3>
              {uiLabel("Prepared for")} {client?.name}
            </h3>
            <p>{draft.introduction}</p>
            {(draft.visuals || []).length > 0 && (
              <section className="print-visuals">
                <h2>Concepto visual</h2>
                {draft.visualNarrative && <p>{draft.visualNarrative}</p>}
                <div>
                  {(draft.visuals || []).map((visual) => (
                    <figure key={visual.id}>
                      <img src={visual.dataUrl} alt={visual.altText} />
                      <figcaption>
                        <strong>{visual.title}</strong>
                        <span>{visual.caption}</span>
                        {visual.measurementStatus === "Unverified" && (
                          <small>Medidas no verificadas</small>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}
            <table>
              <thead>
                <tr>
                  <th>{uiLabel("Description")}</th>
                  <th>{uiLabel("Qty")}</th>
                  <th>{uiLabel("Days")}</th>
                  <th>{uiLabel("Rate")}</th>
                  <th>{uiLabel("Total")}</th>
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
              <p>Descuento: −{money(totals.discount)}</p>
              <p>Impuesto: {money(totals.tax)}</p>
              <h2>Total: {money(totals.total)}</h2>
            </div>
            <h3>{uiLabel("Terms")}</h3>
            <p>{draft.terms}</p>
            <p>
              {uiLabel("Valid until")}: {shortDate(draft.validUntil)}
            </p>
            <p className="tiny">
              {mode === "sample"
                ? "Datos de ejemplo · copia de revisión"
                : "Copia de revisión"}
            </p>
          </div>
          <div className="modal-actions no-print">
            <Button onClick={() => window.print()}>
              <Printer size={16} />
              {uiLabel("Print / save PDF")}
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
