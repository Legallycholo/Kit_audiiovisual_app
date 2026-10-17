import { sameValue } from "../../shared/value";
import { canEditCollection } from "../../shared/access";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { activity, useWorkspace } from "../../shared/store";
import { id, quoteTotals, createProposalRevision } from "../../shared/domain";
import type { Proposal } from "../../shared/types";
import {
  createCreativeProposalVisual,
  createLayoutProposalVisual,
} from "../../shared/proposal-visuals";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";

export function useEditorView({ original }: { original: Proposal }) {
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
    aiOpen,
    setAiOpen,
    compareOpen,
    setCompareOpen,
    compareId,
    setCompareId,
    section,
    setSection,
    editable,
    locked,
    event,
    client,
    family,
    priorVersions,
    comparison,
    creativeOptions,
    layoutOptions,
    totals,
    comparisonTotal,
    dirty,
    addCreativeVisual,
    addLayoutVisual,
    updateVisual,
    removeVisual,
    moveVisual,
    save,
    revision,
    prepareOutgoingMessage,
  };
}
export type EditorView = ReturnType<typeof useEditorView>;
