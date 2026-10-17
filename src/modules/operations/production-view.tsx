import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace, activity } from "../../shared/store";
import { id } from "../../shared/domain";
import type {
  ActualCost,
  CrewShift,
  EventStatus,
  OnsiteChange,
  RunCue,
  Task,
  TransportAssignment,
} from "../../shared/types";

export function useProductionView() {
  const { data, update, toast, mode, user, request } = useWorkspace();
  const [params] = useSearchParams();
  const [eventFilter, setEventFilter] = useState(params.get("event") || "all");
  const [tab, setTab] = useState(
    params.get("tab") === "crew"
      ? "Crew schedule"
      : params.get("tab") === "cues"
        ? "Run of show"
        : "Task board",
  );
  const [draft, setDraft] = useState<Task | null>(null);
  const [members, setMembers] = useState<
    { id: string; name: string; role: string }[]
  >([]);
  const [teamError, setTeamError] = useState("");
  const [operationError, setOperationError] = useState("");
  const [shiftDraft, setShiftDraft] = useState<
    (CrewShift & { eventId: string }) | null
  >(null);
  const [cueDraft, setCueDraft] = useState<
    (RunCue & { eventId: string }) | null
  >(null);
  const [transportDraft, setTransportDraft] = useState<
    (TransportAssignment & { eventId: string }) | null
  >(null);
  const [changeDraft, setChangeDraft] = useState<
    (OnsiteChange & { eventId: string }) | null
  >(null);
  const [costDraft, setCostDraft] = useState<
    (ActualCost & { eventId: string }) | null
  >(null);
  useEffect(() => {
    let active = true;
    setMembers([]);
    setTeamError("");
    if (
      mode === "company" &&
      draft?.eventId &&
      ["Administrator", "Production Manager"].includes(user?.role || "")
    )
      request<{ members: typeof members }>(
        `/team?eventId=${encodeURIComponent(draft.eventId)}`,
      )
        .then((result) => {
          if (active) setMembers(result.members);
        })
        .catch((error) => {
          if (active) setTeamError(error.message);
        });
    return () => {
      active = false;
    };
  }, [mode, draft?.eventId, user?.role, request]);
  const tasks = data.tasks.filter(
    (t) => eventFilter === "all" || t.eventId === eventFilter,
  );
  const crew = Array.from(new Set(data.tasks.map((t) => t.assignee)));
  const readinessEvents = data.events.filter(
    (event) => eventFilter === "all" || event.id === eventFilter,
  );
  const canManageProduction =
    !user || ["Administrator", "Production Manager"].includes(user.role);
  const selectedEventId =
    eventFilter === "all" ? data.events[0]?.id || "" : eventFilter;
  const visibleOperations = data.operations.filter(
    (operation) => eventFilter === "all" || operation.eventId === eventFilter,
  );
  const changeProductionStatus = async (
    eventId: string,
    status: EventStatus,
  ) => {
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return;
    if (
      await update((workspace) => ({
        ...workspace,
        events: workspace.events.map((item) =>
          item.id === eventId ? { ...item, status } : item,
        ),
        activity: [
          activity(
            status === "Completed"
              ? "Production closeout confirmed"
              : "Production status confirmed",
            `${event.name}: ${status}`,
            eventId,
          ),
          ...workspace.activity,
        ],
      }))
    )
      toast(
        status === "Completed"
          ? "Cierre de producción confirmado."
          : "Estado de producción confirmado.",
      );
  };
  return {
    data,
    update,
    toast,
    mode,
    user,
    request,
    params,
    eventFilter,
    setEventFilter,
    tab,
    setTab,
    draft,
    setDraft,
    members,
    setMembers,
    teamError,
    setTeamError,
    operationError,
    setOperationError,
    shiftDraft,
    setShiftDraft,
    cueDraft,
    setCueDraft,
    transportDraft,
    setTransportDraft,
    changeDraft,
    setChangeDraft,
    costDraft,
    setCostDraft,
    tasks,
    crew,
    readinessEvents,
    canManageProduction,
    selectedEventId,
    visibleOperations,
    changeProductionStatus,
  };
}
export type ProductionView = ReturnType<typeof useProductionView>;
