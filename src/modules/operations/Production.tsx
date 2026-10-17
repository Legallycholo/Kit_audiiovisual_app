import { Plus } from "lucide-react";
import { Button, PageHeader, Tabs } from "../../shared/ui";
import { id } from "../../shared/domain";
import type { Task } from "../../shared/types";
import { useProductionView } from "./production-view";
import { ProductionTabs } from "./ProductionTabs";
import { ProductionDialogs } from "./ProductionDialogs";

export function Production() {
  const ctx = useProductionView();
  const { data, user, eventFilter, setEventFilter, tab, setTab, setDraft } =
    ctx;
  return (
    <>
      <PageHeader
        title="Team & production"
        actions={
          <Button
            disabled={Boolean(
              user &&
              !["Administrator", "Production Manager"].includes(user.role),
            )}
            onClick={() =>
              setDraft({
                id: id(),
                eventId:
                  eventFilter === "all"
                    ? data.events[0]?.id || ""
                    : eventFilter,
                title: "",
                assignee: user?.name || "Alex Morgan",
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
            "Logistics & costs",
            "Production readiness",
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
      <ProductionTabs ctx={ctx} />
      <ProductionDialogs ctx={ctx} />
    </>
  );
}
