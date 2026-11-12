import { sameValue } from "../../shared/value";
import { canEditCollection } from "../../shared/access";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { activity, useWorkspace } from "../../shared/store";
import { id, quoteTotals, createProposalRevision } from "../../shared/domain";
import type { Proposal, ProposalVisual, QuoteLine } from "../../shared/types";
import {
  createCreativeProposalVisual,
  createLayoutProposalVisual,
} from "../../shared/proposal-visuals";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { proposalDocumentData } from "./templates/ProposalDocument";
import type { ProposalEditHandlers } from "./templates/KitClassicProposal";
import type { DraftSuggestion } from "./ProposalAssistant";

/** Statuses whose content is a record and can only be revised. */
export const LOCKED_STATUSES: Proposal["status"][] = [
  "Issued",
  "Accepted",
  "Declined",
  "Superseded",
];

export function useEditorView({ original }: { original: Proposal }) {
  const { data, update, toast, user, mode, saving } = useWorkspace();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Proposal>(() => structuredClone(original));
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [outgoingMessage, setOutgoingMessage] = useState("");
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareId, setCompareId] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const assistantKey = `kit.proposal-assistant:${user?.id || "local"}`;
  const [assistantOpen, setAssistantOpenState] = useState(() => {
    if (params.get("kit") === "1") return true;
    // Beside the document on wide screens; on narrow ones it opens only on request.
    if (!matchMedia("(min-width: 1100px)").matches) return false;
    try {
      return localStorage.getItem(assistantKey) !== "closed";
    } catch {
      return true;
    }
  });
  const setAssistantOpen = useCallback(
    (open: boolean) => {
      setAssistantOpenState(open);
      try {
        localStorage.setItem(assistantKey, open ? "open" : "closed");
      } catch {
        /* A preference only. */
      }
    },
    [assistantKey],
  );
  // ?kit=1 opens the assistant once (palette and list actions); then it is dropped from the URL.
  useEffect(() => {
    if (params.get("kit") !== "1") return;
    const next = new URLSearchParams(params);
    next.delete("kit");
    setParams(next, { replace: true });
  }, [params, setParams]);
  const editable = canEditCollection(user, "proposals");
  const locked = !editable || LOCKED_STATUSES.includes(original.status);
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
  const document = useMemo(
    () => proposalDocumentData(draft, data),
    [draft, data],
  );
  const totals = document.totals;
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

  // ---------- document edits ----------
  const patch = (values: Partial<Proposal>) =>
    setDraft((current) => ({ ...current, ...values }));
  const setClient: ProposalEditHandlers["setClient"] = (field, value) =>
    setDraft((current) => ({
      ...current,
      // The first edit copies the linked client onto the document; the master record never changes.
      clientSnapshot: {
        ...proposalDocumentData(current, data).client,
        [field]: value,
      },
    }));
  const setLine = (lineId: string, values: Partial<QuoteLine>) =>
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.id === lineId ? { ...line, ...values } : line,
      ),
    }));
  const addCatalogLine = (equipmentId: string) => {
    const item = data.equipment.find((q) => q.id === equipmentId);
    if (!item) return;
    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        {
          id: id(),
          equipmentId: item.id,
          description: item.name,
          quantity: 1,
          rate: item.rate,
          days: 1,
        },
      ],
    }));
  };
  const addCustomLine = () =>
    setDraft((current) => ({
      ...current,
      lines: [
        ...current.lines,
        { id: id(), description: "", quantity: 1, rate: 0, days: 1 },
      ],
    }));
  const removeLine = (lineId: string) =>
    setDraft((current) => ({
      ...current,
      lines: current.lines.filter((line) => line.id !== lineId),
    }));
  const moveLine = (lineId: string, direction: -1 | 1) =>
    setDraft((current) => {
      const lines = [...current.lines];
      const from = lines.findIndex((line) => line.id === lineId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= lines.length) return current;
      [lines[from], lines[to]] = [lines[to], lines[from]];
      return { ...current, lines };
    });
  const linkEvent = (eventId: string) => {
    const linked = data.events.find((e) => e.id === eventId);
    setDraft((current) => ({
      ...current,
      eventId,
      // A linked event supplies the dates when the document has none yet.
      validUntil: current.validUntil || linked?.date || "",
      title: current.title.trim() ? current.title : linked?.name || "",
    }));
  };
  const edit: ProposalEditHandlers | undefined = locked
    ? undefined
    : {
        patch,
        setClient,
        setLine,
        addCatalogLine,
        addCustomLine,
        removeLine,
        moveLine,
        catalog: data.equipment,
      };

  /** Applies a reviewed KIT suggestion. Rates stay the catalog's; custom lines keep their typed price. */
  const applySuggestion = (
    suggestion: DraftSuggestion,
    options: { text: boolean; lines: boolean; money: boolean },
  ) =>
    setDraft((current) => {
      const next: Proposal = { ...current, status: "Draft" };
      if (options.text) {
        next.title = suggestion.title;
        next.introduction = suggestion.introduction;
        if (suggestion.scope !== undefined) next.scope = suggestion.scope;
        if (suggestion.notes !== undefined) next.notes = suggestion.notes;
        if (suggestion.terms !== undefined) next.terms = suggestion.terms;
      }
      if (options.lines)
        next.lines = suggestion.lines.map((line) => {
          // A custom service already on the document keeps the price the person set.
          const known = !line.equipmentId
            ? current.lines.find(
                (existing) =>
                  !existing.equipmentId &&
                  existing.description.trim().toLowerCase() ===
                    line.description.trim().toLowerCase(),
              )
            : undefined;
          return known ? { ...line, rate: known.rate } : line;
        });
      if (options.money && suggestion.discount !== undefined)
        next.discount = suggestion.discount;
      next.aiReview = suggestion.aiReview;
      return next;
    });

  // ---------- visuals (optional section) ----------
  /** Adds a ready visual (a KIT Design render) once, up to the document's limit. */
  const addVisual = (visual: ProposalVisual) => {
    if ((draft.visuals || []).length >= 12) {
      setError("La propuesta admite un máximo de 12 recursos visuales.");
      return;
    }
    if (
      draft.visuals?.some(
        (existing) =>
          existing.sourceType === visual.sourceType &&
          existing.sourceId === visual.sourceId,
      )
    )
      return;
    setDraft({
      ...draft,
      status: "Draft",
      visuals: [...(draft.visuals || []), visual],
    });
    setError("");
  };
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

  // ---------- persistence ----------
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
      if (next.lines.some((line) => !line.description.trim()))
        throw new Error("Cada partida necesita una descripción.");
      if (next.visuals?.some((visual) => !visual.altText.trim()))
        throw new Error(
          "Cada recurso visual necesita texto alternativo antes de guardar.",
        );
      next = { ...next, updatedAt: new Date().toISOString() };
      if (
        !(await update((s) => ({
          ...s,
          proposals: s.proposals.map((p) => (p.id === next.id ? next : p)),
          activity: [
            activity(
              "Proposal saved",
              `${next.number} · revision ${next.version}`,
              next.eventId || undefined,
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
            next.eventId || undefined,
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
  return {
    original,
    data,
    update,
    toast,
    user,
    mode,
    saving,
    navigate,
    draft,
    setDraft,
    error,
    setError,
    preview,
    setPreview,
    sending,
    setSending,
    outgoingMessage,
    setOutgoingMessage,
    compareOpen,
    setCompareOpen,
    compareId,
    setCompareId,
    versionsOpen,
    setVersionsOpen,
    assistantOpen,
    setAssistantOpen,
    editable,
    locked,
    event,
    client,
    family,
    priorVersions,
    comparison,
    creativeOptions,
    layoutOptions,
    document,
    totals,
    comparisonTotal,
    dirty,
    edit,
    patch,
    linkEvent,
    applySuggestion,
    addCreativeVisual,
    addLayoutVisual,
    addVisual,
    updateVisual,
    removeVisual,
    moveVisual,
    save,
    revision,
    prepareOutgoingMessage,
  };
}
export type EditorView = ReturnType<typeof useEditorView>;
