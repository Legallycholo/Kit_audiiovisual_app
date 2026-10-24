import { uiLabel } from "../../shared/i18n";
import { ProposalAI, type DraftSuggestion } from "../ProposalAI";
import { canEditCollection } from "../../shared/access";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, FileText, Plus, Sparkles } from "lucide-react";
import { activity, useWorkspace } from "../../shared/store";
import {
  Badge,
  Button,
  Empty,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchField,
  Tabs,
} from "../../shared/ui";
import { id, money, quoteTotals } from "../../shared/domain";
import type { Proposal } from "../../shared/types";

export function Proposals() {
  const { data, update, toast, user, mode, saving } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("All proposals");
  const [create, setCreate] = useState(false);
  const [ai, setAI] = useState(false);
  const [eventId, setEventId] = useState(
    params.get("event") || data.events[0]?.id || "",
  );
  // Palette actions open the create dialog with ?new=manual or ?new=ai.
  useEffect(() => {
    const requested = params.get("new");
    if (!requested || !canEditCollection(user, "proposals")) return;
    setCreate(true);
    setAI(requested === "ai");
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }, [params, setParams, user]);
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
        menu={
          canEditCollection(user, "proposals")
            ? [
                {
                  label: "Draft with AI",
                  icon: <Sparkles size={16} />,
                  onSelect: () => {
                    setCreate(true);
                    setAI(true);
                  },
                },
              ]
            : undefined
        }
        actions={
          canEditCollection(user, "proposals") ? (
            <Button
              onClick={() => {
                setCreate(true);
                setAI(false);
              }}
            >
              <Plus size={17} />
              {uiLabel("New proposal")}
            </Button>
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
          <SearchField value={search} onChange={setSearch} />
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
                        aria-label={`${uiLabel("Edit")} ${p.title}`}
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
