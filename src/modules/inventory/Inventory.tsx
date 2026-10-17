import { canEditCollection } from "../../shared/access";
import { Plus, CalendarDays } from "lucide-react";
import { Button, ErrorNote, PageHeader } from "../../shared/ui";
import { id, shortDate } from "../../shared/domain";
import type { Equipment } from "../../shared/types";
import { useInventoryView } from "./inventory-view";
import { InventoryCatalog } from "./InventoryCatalog";
import { InventoryRecordDialogs } from "./InventoryRecordDialogs";
import { InventoryFulfillmentDialogs } from "./InventoryFulfillmentDialogs";

export function Inventory() {
  const ctx = useInventoryView();
  const { data, user, setDraft, availabilityError, conflicts, addReservation } =
    ctx;
  return (
    <>
      <PageHeader
        eyebrow="THE RIGHT GEAR. IN THE RIGHT PLACE."
        title="Equipment & inventory"
        description="Your owned equipment, availability, and event allocations."
        actions={
          <>
            <Button
              disabled={!canEditCollection(user, "reservations")}
              variant="secondary"
              onClick={addReservation}
            >
              <CalendarDays size={17} />
              Reserve equipment
            </Button>
            <Button
              disabled={!canEditCollection(user, "equipment")}
              onClick={() =>
                setDraft({
                  id: id(),
                  name: "",
                  sku: "",
                  category: "Audio",
                  quantity: 1,
                  maintenance: 0,
                  rate: 0,
                  description: "",
                })
              }
            >
              <Plus size={17} />
              Add equipment
            </Button>
          </>
        }
      />
      {availabilityError && <ErrorNote>{availabilityError}</ErrorNote>}
      {conflicts.length > 0 && (
        <ErrorNote>
          {conflicts
            .map((conflict) => {
              const equipment = data.equipment.find(
                (item) => item.id === conflict.equipmentId,
              );
              const events = conflict.eventIds
                .map(
                  (eventId) =>
                    data.events.find((event) => event.id === eventId)?.name,
                )
                .filter(Boolean)
                .join(", ");
              return `${equipment?.name || conflict.equipmentId}: ${conflict.reserved} allocated / ${conflict.capacity} available on ${shortDate(conflict.at)} (${events}).`;
            })
            .join(" ")}
        </ErrorNote>
      )}
      <InventoryCatalog ctx={ctx} />
      <InventoryRecordDialogs ctx={ctx} />
      <InventoryFulfillmentDialogs ctx={ctx} />
    </>
  );
}
