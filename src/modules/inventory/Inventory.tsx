import { useState } from "react";
import { canEditCollection } from "../../shared/access";
import { Plus, CalendarDays, Download, FileUp } from "lucide-react";
import { Button, ErrorNote, PageHeader } from "../../shared/ui";
import { downloadFile, id, shortDate } from "../../shared/domain";
import { equipmentToCsv, planEquipmentImport } from "../../shared/csv";
import { activity, useWorkspace } from "../../shared/store";
import type { Equipment } from "../../shared/types";
import { CsvImportDialog } from "../CsvImport";
import { useInventoryView } from "./inventory-view";
import { InventoryCatalog } from "./InventoryCatalog";
import { InventoryRecordDialogs } from "./InventoryRecordDialogs";
import { InventoryFulfillmentDialogs } from "./InventoryFulfillmentDialogs";

export function Inventory() {
  const ctx = useInventoryView();
  const { data, user, setDraft, availabilityError, conflicts, addReservation } =
    ctx;
  const { update, toast } = useWorkspace();
  const [importing, setImporting] = useState(false);
  return (
    <>
      <PageHeader
        title="Equipment & inventory"
        description="Your owned equipment, availability, and event allocations."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                downloadFile(
                  `kit-equipos-${new Date().toISOString().slice(0, 10)}.csv`,
                  equipmentToCsv(data.equipment),
                  "text/csv;charset=utf-8",
                )
              }
            >
              <Download size={17} />
              Export CSV
            </Button>
            <Button
              disabled={!canEditCollection(user, "equipment")}
              variant="secondary"
              onClick={() => setImporting(true)}
            >
              <FileUp size={17} />
              Import CSV
            </Button>
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
      {importing && (
        <CsvImportDialog
          title="Import equipment from CSV"
          description="Rows are matched to the catalog by SKU. Nothing changes until you confirm."
          plan={(text) =>
            planEquipmentImport(text, data.equipment, id, (equipmentId) =>
              data.maintenanceRecords
                .filter(
                  (record) =>
                    record.equipmentId === equipmentId &&
                    record.status !== "Resolved",
                )
                .reduce((sum, record) => sum + record.quantity, 0),
            )
          }
          label={(item: Equipment) => `${item.sku} · ${item.name}`}
          onCommit={async (plan) => {
            const updates = new Map(
              plan.updated.map((item) => [item.id, item]),
            );
            const saved = await update((workspace) => ({
              ...workspace,
              equipment: [
                ...workspace.equipment.map(
                  (item) => updates.get(item.id) ?? item,
                ),
                ...plan.created,
              ],
              activity: [
                activity(
                  "Equipment catalog imported",
                  `${plan.created.length} nuevos · ${plan.updated.length} actualizados`,
                ),
                ...workspace.activity,
              ],
            }));
            if (saved) toast("Catálogo de equipos importado.");
            return saved;
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </>
  );
}
