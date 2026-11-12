import { uiLabel } from "../../shared/i18n";
import { canEditCollection } from "../../shared/access";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpRight, FileText, Plus, Sparkles } from "lucide-react";
import { activity, useWorkspace } from "../../shared/store";
import {
  Badge,
  Button,
  Empty,
  PageHeader,
  Panel,
  SearchField,
  Tabs,
} from "../../shared/ui";
import {
  id,
  money,
  nextProposalNumber,
  quoteTotals,
} from "../../shared/domain";
import type { Proposal } from "../../shared/types";
import { longDate } from "./templates/ProposalDocument";
import "./templates/proposal-document.css";

const filters = [
  "Todos",
  "Borradores",
  "Revisión",
  "Enviadas",
  "Aceptadas",
] as const;
const filterStatuses: Record<(typeof filters)[number], Proposal["status"][]> = {
  Todos: [],
  Borradores: ["Draft"],
  Revisión: ["In review", "Ready to send"],
  Enviadas: ["Issued"],
  Aceptadas: ["Accepted"],
};

const inThirtyDays = () =>
  new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

/** The default terms of a new KIT document; edited in place afterwards. */
export const DEFAULT_TERMS =
  "La disponibilidad, las condiciones de pago y el alcance final están sujetos a revisión.";

export function Proposals() {
  const { data, update, user, saving } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("Todos");
  const canCreate = canEditCollection(user, "proposals");
  const eventFilter = params.get("event") || "";

  /** "Nueva propuesta": the document opens at once, linked to the event when one is known. */
  async function createDraft(withKit: boolean) {
    const event = data.events.find((e) => e.id === eventFilter);
    const proposal: Proposal = {
      id: id(),
      number: nextProposalNumber(data.proposals),
      eventId: event?.id ?? "",
      version: 1,
      // The document needs a title and a validity date to be stored; both are edited in place.
      title: event?.name || "Nueva propuesta",
      introduction: event?.notes ?? "",
      terms: DEFAULT_TERMS,
      lines: [],
      discount: 0,
      tax: 0,
      status: "Draft",
      validUntil: event?.date || inThirtyDays(),
      presentationTemplate: "Classic",
      documentType: "PROPUESTA",
      updatedAt: new Date().toISOString(),
    };
    if (
      !(await update((s) => ({
        ...s,
        proposals: [...s.proposals, proposal],
        activity: [
          activity(
            "Proposal draft created",
            proposal.number,
            event?.id ?? undefined,
          ),
          ...s.activity,
        ],
      })))
    )
      return;
    navigate(`/proposals/${proposal.id}${withKit ? "?kit=1" : ""}`);
  }
  // Palette actions arrive as ?new=manual or ?new=ai.
  useEffect(() => {
    const requested = params.get("new");
    if (!requested || !canCreate) return;
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
    void createDraft(requested === "ai");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, canCreate]);

  const query = search.trim().toLowerCase();
  const filtered = data.proposals
    .filter((p) => {
      const event = data.events.find((e) => e.id === p.eventId);
      const client = data.clients.find((c) => c.id === event?.clientId);
      const haystack =
        `${p.number} ${p.title} ${client?.name ?? ""} ${p.clientSnapshot?.name ?? ""} ${event?.name ?? ""}`.toLowerCase();
      return (
        (!query || haystack.includes(query)) &&
        (!eventFilter || p.eventId === eventFilter) &&
        (filter === "Todos" || filterStatuses[filter].includes(p.status))
      );
    })
    .sort((a, b) =>
      (b.updatedAt ?? b.validUntil).localeCompare(a.updatedAt ?? a.validUntil),
    );
  return (
    <>
      <PageHeader
        eyebrow={uiLabel("TURN A GOOD IDEA INTO A YES")}
        title={uiLabel("Proposals & quotations")}
        description="Describe, genera, edita, aprueba y envía. Cada versión queda guardada."
        menu={
          canCreate
            ? [
                {
                  label: "Draft with AI",
                  icon: <Sparkles size={16} />,
                  disabled: saving,
                  onSelect: () => void createDraft(true),
                },
              ]
            : undefined
        }
        actions={
          canCreate ? (
            <Button disabled={saving} onClick={() => void createDraft(false)}>
              <Plus size={17} aria-hidden="true" />
              {uiLabel("New proposal")}
            </Button>
          ) : undefined
        }
      />
      <Panel>
        <div className="list-toolbar">
          <Tabs
            items={[...filters]}
            value={filter}
            onChange={(value) => setFilter(value as (typeof filters)[number])}
          />
          <SearchField value={search} onChange={setSearch} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{uiLabel("Proposal")}</th>
                <th>{uiLabel("Client")}</th>
                <th>{uiLabel("Event")}</th>
                <th>{uiLabel("Total")}</th>
                <th>{uiLabel("Status")}</th>
                <th>Actualizada</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const event = data.events.find((e) => e.id === p.eventId);
                const client = data.clients.find(
                  (c) => c.id === event?.clientId,
                );
                let total = 0;
                try {
                  total = quoteTotals(p.lines, p.discount, p.tax).total;
                } catch {
                  /* Shown as 0 until the draft is corrected. */
                }
                return (
                  <tr key={p.id}>
                    <td>
                      <Link className="record-cell" to={`/proposals/${p.id}`}>
                        <span className="document-icon">
                          <FileText size={21} aria-hidden="true" />
                        </span>
                        <span>
                          <strong>{p.title || "Sin título"}</strong>
                          <small>
                            {p.number} · v{p.version}
                          </small>
                        </span>
                      </Link>
                    </td>
                    <td>{p.clientSnapshot?.name || client?.name || "—"}</td>
                    <td>{event?.name || "Sin evento"}</td>
                    <td className="amount">{money(total)}</td>
                    <td>
                      <Badge>{p.status}</Badge>
                    </td>
                    <td className="nowrap">
                      {p.updatedAt ? longDate(p.updatedAt.slice(0, 10)) : "—"}
                    </td>
                    <td>
                      <Link
                        className="icon-button"
                        to={`/proposals/${p.id}`}
                        aria-label={`${uiLabel("Edit")} ${p.title || p.number}`}
                      >
                        <ArrowUpRight size={17} aria-hidden="true" />
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
              description="Pulsa «Nueva propuesta» y empieza a escribir en el documento. KIT puede redactarla a partir de una descripción."
              action={
                canCreate ? (
                  <Button onClick={() => void createDraft(false)}>
                    <Plus size={16} aria-hidden="true" />
                    {uiLabel("New proposal")}
                  </Button>
                ) : undefined
              }
            />
          )}
        </div>
      </Panel>
    </>
  );
}
