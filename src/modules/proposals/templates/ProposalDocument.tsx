import type { ReactNode } from "react";
import type {
  Proposal,
  ProposalClientSnapshot,
  ProposalEventSnapshot,
  Workspace,
} from "../../../shared/types";
import { quoteTotals } from "../../../shared/domain";

/**
 * Everything a proposal template prints, resolved once: the company's own
 * identity from settings, the client as snapshotted on the document (or the
 * linked client while no snapshot exists), the event the same way, and the
 * money from quoteTotals(), which stays the single source of truth.
 */
export interface ProposalDocumentData {
  proposal: Proposal;
  company: Workspace["settings"];
  client: ProposalClientSnapshot;
  event: ProposalEventSnapshot | null;
  linkedEventId: string;
  totals: ReturnType<typeof quoteTotals>;
  issuedOn: string;
  /** Fecha de término: the proposal's own date, else the event's end. */
  completion: string;
}

const emptyTotals = { subtotal: 0, discount: 0, tax: 0, total: 0 };

export function proposalDocumentData(
  proposal: Proposal,
  workspace: Workspace,
): ProposalDocumentData {
  const event = workspace.events.find((e) => e.id === proposal.eventId);
  const venue = workspace.venues.find((v) => v.id === event?.venueId);
  const client = workspace.clients.find((c) => c.id === event?.clientId);
  let totals = emptyTotals;
  try {
    totals = quoteTotals(proposal.lines, proposal.discount, proposal.tax);
  } catch {
    /* Invalid numbers are reported by the editor on save. */
  }
  const eventSnapshot: ProposalEventSnapshot | null =
    proposal.eventSnapshot ??
    (event
      ? {
          name: event.name,
          type: event.type,
          venue: venue?.name ?? "",
          start: event.date,
          end: event.endDate,
          attendees: event.attendees,
        }
      : null);
  return {
    proposal,
    company: workspace.settings,
    client: proposal.clientSnapshot ?? {
      name: client?.name ?? "",
      contact: client?.contact ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
    },
    event: eventSnapshot,
    linkedEventId: proposal.eventId,
    totals,
    issuedOn: proposal.updatedAt?.slice(0, 10) || proposal.validUntil || "",
    completion: proposal.completionDate || eventSnapshot?.end || "",
  };
}

/** "31 de octubre de 2026"; an empty or malformed date prints as given. */
export function longDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return value;
  return new Intl.DateTimeFormat("es-PR", { dateStyle: "long" }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
}

/**
 * A document field. In edit mode it is a controlled input or textarea styled
 * as the printed text (no contenteditable); otherwise the text itself.
 */
export function DocText({
  value,
  onChange,
  label,
  placeholder,
  multiline = false,
  as: Tag = "p",
  className = "",
  type = "text",
}: {
  value: string;
  onChange?: (value: string) => void;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  as?: "p" | "span" | "h1" | "h2" | "strong" | "div";
  className?: string;
  type?: "text" | "date" | "email" | "tel";
}) {
  if (!onChange) {
    if (!value.trim()) return null;
    return (
      <Tag className={`doc-text ${className}`}>
        {type === "date" ? longDate(value) : value}
      </Tag>
    );
  }
  if (multiline)
    return (
      <textarea
        className={`doc-input doc-area ${className}`}
        aria-label={label}
        placeholder={placeholder ?? label}
        value={value}
        rows={1}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  return (
    <input
      className={`doc-input ${className}`}
      aria-label={label}
      placeholder={placeholder ?? label}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A labelled cell of the document (VENDEDOR, TRABAJO, …). */
export function DocCell({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="doc-cell">
      <span className="doc-label">{label}</span>
      {children}
    </div>
  );
}
