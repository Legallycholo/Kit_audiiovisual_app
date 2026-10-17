import { Plus, Truck } from "lucide-react";
import { activity } from "../../shared/store";
import { Button, ErrorNote, Field, Modal } from "../../shared/ui";
import { id, validateReservation } from "../../shared/domain";
import type { Equipment, Reservation } from "../../shared/types";
import { moveDate } from "./helpers";
import type { InventoryView } from "./inventory-view";

export function InventoryFulfillmentDialogs({ ctx }: { ctx: InventoryView }) {
  const {
    data,
    update,
    toast,
    fulfillment,
    setFulfillment,
    packageDraft,
    setPackageDraft,
    packageApply,
    setPackageApply,
    maintenanceDraft,
    setMaintenanceDraft,
    error,
    setError,
  } = ctx;
  return (
    <>
      {fulfillment && (
        <Modal
          title="Equipment handoff"
          description="Track substitution, custody, partial returns, and damaged units."
          onClose={() => {
            setFulfillment(null);
            setError("");
          }}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const old = data.reservations.find(
                (item) => item.id === fulfillment.id,
              );
              if (!old) return;
              const dispatched = fulfillment.dispatchedQuantity || 0;
              const returned = fulfillment.returnedQuantity || 0;
              const damaged = fulfillment.damagedQuantity || 0;
              if (returned + damaged > dispatched) {
                setError(
                  "Returned and damaged units cannot exceed dispatched units.",
                );
                return;
              }
              if (
                fulfillment.status === "Returned" &&
                returned + damaged !== dispatched
              ) {
                setError(
                  "Reconcile every dispatched unit before marking the allocation returned.",
                );
                return;
              }
              try {
                const actualId =
                  fulfillment.substituteEquipmentId || fulfillment.equipmentId;
                const item = data.equipment.find(
                  (equipment) => equipment.id === actualId,
                );
                if (!item)
                  throw new Error("Select valid fulfillment equipment.");
                if (!["Returned", "Cancelled"].includes(fulfillment.status))
                  validateReservation(item, data.reservations, fulfillment);
                const addedDamage = damaged - (old.damagedQuantity || 0);
                const addedOwnedDamage =
                  fulfillment.source === "Supplier" ? 0 : addedDamage;
                if (addedDamage < 0)
                  throw new Error("Recorded damage cannot be reduced.");
                if (item.maintenance + addedOwnedDamage > item.quantity)
                  throw new Error("Damaged quantity exceeds owned stock.");
                const now = new Date().toISOString();
                if (
                  await update((workspace) => ({
                    ...workspace,
                    reservations: workspace.reservations.map((record) =>
                      record.id === fulfillment.id ? fulfillment : record,
                    ),
                    equipment:
                      addedOwnedDamage > 0
                        ? workspace.equipment.map((record) =>
                            record.id === actualId
                              ? {
                                  ...record,
                                  maintenance:
                                    record.maintenance + addedOwnedDamage,
                                }
                              : record,
                          )
                        : workspace.equipment,
                    maintenanceRecords:
                      addedOwnedDamage > 0
                        ? [
                            ...workspace.maintenanceRecords,
                            {
                              id: id(),
                              equipmentId: actualId,
                              reservationId: fulfillment.id,
                              quantity: addedOwnedDamage,
                              issue: `Damage recorded during return: ${fulfillment.custodyNote || "Inspection required"}`,
                              status: "Open" as const,
                              openedAt: now,
                              cost: 0,
                            },
                          ]
                        : workspace.maintenanceRecords,
                    activity: [
                      activity(
                        "Equipment custody updated",
                        `${fulfillment.status}: ${returned} returned, ${damaged} damaged.`,
                        fulfillment.eventId,
                      ),
                      ...workspace.activity,
                    ],
                  }))
                ) {
                  setFulfillment(null);
                  setError("");
                  toast("Equipment handoff reconciled.");
                }
              } catch (reason) {
                setError((reason as Error).message);
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="form-grid">
              <Field label="Fulfillment status">
                <select
                  value={fulfillment.status}
                  onChange={(event) => {
                    const status = event.target.value as Reservation["status"];
                    setFulfillment({
                      ...fulfillment,
                      status,
                      dispatchedQuantity:
                        status === "Dispatched" || status === "Returned"
                          ? fulfillment.dispatchedQuantity ||
                            fulfillment.quantity
                          : fulfillment.dispatchedQuantity,
                    });
                  }}
                >
                  {fulfillment.status === "Hold" && <option>Hold</option>}
                  {["Hold", "Confirmed"].includes(fulfillment.status) && (
                    <option>Confirmed</option>
                  )}
                  {["Confirmed", "Dispatched"].includes(fulfillment.status) && (
                    <option>Dispatched</option>
                  )}
                  {["Confirmed", "Dispatched"].includes(fulfillment.status) && (
                    <option>Returned</option>
                  )}
                  {fulfillment.status !== "Dispatched" && (
                    <option>Cancelled</option>
                  )}
                </select>
              </Field>
              <Field label="Inventory source">
                <input value={fulfillment.source || "Owned"} disabled />
              </Field>
              {fulfillment.source !== "Supplier" && (
                <Field label="Substitute with">
                  <select
                    value={fulfillment.substituteEquipmentId || ""}
                    onChange={(event) =>
                      setFulfillment({
                        ...fulfillment,
                        substituteEquipmentId: event.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Original equipment</option>
                    {data.equipment
                      .filter((item) => item.id !== fulfillment.equipmentId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Dispatched">
                <input
                  type="number"
                  min="0"
                  max={fulfillment.quantity}
                  value={fulfillment.dispatchedQuantity || 0}
                  onChange={(event) =>
                    setFulfillment({
                      ...fulfillment,
                      dispatchedQuantity: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Returned">
                <input
                  type="number"
                  min="0"
                  max={fulfillment.dispatchedQuantity || 0}
                  value={fulfillment.returnedQuantity || 0}
                  onChange={(event) =>
                    setFulfillment({
                      ...fulfillment,
                      returnedQuantity: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Damaged">
                <input
                  type="number"
                  min={
                    data.reservations.find((item) => item.id === fulfillment.id)
                      ?.damagedQuantity || 0
                  }
                  max={fulfillment.dispatchedQuantity || 0}
                  value={fulfillment.damagedQuantity || 0}
                  onChange={(event) =>
                    setFulfillment({
                      ...fulfillment,
                      damagedQuantity: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Custody and inspection note">
              <textarea
                value={fulfillment.custodyNote || ""}
                onChange={(event) =>
                  setFulfillment({
                    ...fulfillment,
                    custodyNote: event.target.value,
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Save handoff</Button>
            </div>
          </form>
        </Modal>
      )}
      {packageDraft && (
        <Modal title="Equipment package" onClose={() => setPackageDraft(null)}>
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!packageDraft.items.length) {
                setError("Add at least one equipment item.");
                return;
              }
              if (
                await update((workspace) => ({
                  ...workspace,
                  packages: workspace.packages.some(
                    (item) => item.id === packageDraft.id,
                  )
                    ? workspace.packages.map((item) =>
                        item.id === packageDraft.id ? packageDraft : item,
                      )
                    : [...workspace.packages, packageDraft],
                }))
              ) {
                setPackageDraft(null);
                setError("");
                toast("Equipment package saved.");
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="Package name">
              <input
                required
                value={packageDraft.name}
                onChange={(event) =>
                  setPackageDraft({ ...packageDraft, name: event.target.value })
                }
              />
            </Field>
            <Field label="Description">
              <textarea
                value={packageDraft.description}
                onChange={(event) =>
                  setPackageDraft({
                    ...packageDraft,
                    description: event.target.value,
                  })
                }
              />
            </Field>
            {packageDraft.items.map((line, index) => (
              <div className="form-grid" key={`${line.equipmentId}-${index}`}>
                <Field label={`Equipment ${index + 1}`}>
                  <select
                    value={line.equipmentId}
                    onChange={(event) =>
                      setPackageDraft({
                        ...packageDraft,
                        items: packageDraft.items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, equipmentId: event.target.value }
                            : item,
                        ),
                      })
                    }
                  >
                    {data.equipment.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quantity">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={line.quantity}
                    onChange={(event) =>
                      setPackageDraft({
                        ...packageDraft,
                        items: packageDraft.items.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, quantity: Number(event.target.value) }
                            : item,
                        ),
                      })
                    }
                  />
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    setPackageDraft({
                      ...packageDraft,
                      items: packageDraft.items.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    })
                  }
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              disabled={!data.equipment.length}
              onClick={() =>
                setPackageDraft({
                  ...packageDraft,
                  items: [
                    ...packageDraft.items,
                    { equipmentId: data.equipment[0].id, quantity: 1 },
                  ],
                })
              }
            >
              <Plus size={15} /> Add item
            </Button>
            <label className="check-row">
              <input
                type="checkbox"
                checked={packageDraft.active}
                onChange={(event) =>
                  setPackageDraft({
                    ...packageDraft,
                    active: event.target.checked,
                  })
                }
              />
              Active for new reservations
            </label>
            <div className="modal-actions">
              <Button>Save package</Button>
            </div>
          </form>
        </Modal>
      )}
      {packageApply && (
        <Modal
          title="Reserve equipment package"
          onClose={() => setPackageApply(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (submitEvent) => {
              submitEvent.preventDefault();
              const equipmentPackage = data.packages.find(
                (item) => item.id === packageApply.packageId,
              );
              const event = data.events.find(
                (item) => item.id === packageApply.eventId,
              );
              if (!equipmentPackage || !event) return;
              const reservations = equipmentPackage.items.map((item) => ({
                id: id(),
                eventId: event.id,
                equipmentId: item.equipmentId,
                quantity: item.quantity,
                start: moveDate(event.date, -packageApply.before),
                end: moveDate(event.endDate, packageApply.after),
                status: "Hold" as const,
                source: "Owned" as const,
                bufferBeforeDays: packageApply.before,
                bufferAfterDays: packageApply.after,
              }));
              try {
                for (const candidate of reservations) {
                  const item = data.equipment.find(
                    (equipment) => equipment.id === candidate.equipmentId,
                  )!;
                  validateReservation(
                    item,
                    [...data.reservations, ...reservations],
                    candidate,
                  );
                }
                if (
                  await update((workspace) => ({
                    ...workspace,
                    reservations: [...workspace.reservations, ...reservations],
                    activity: [
                      activity(
                        "Equipment package reserved",
                        equipmentPackage.name,
                        event.id,
                      ),
                      ...workspace.activity,
                    ],
                  }))
                ) {
                  setPackageApply(null);
                  toast("Package reserved on hold.");
                }
              } catch (reason) {
                setError((reason as Error).message);
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="Event">
              <select
                value={packageApply.eventId}
                onChange={(event) =>
                  setPackageApply({
                    ...packageApply,
                    eventId: event.target.value,
                  })
                }
              >
                {data.events.map((event) => (
                  <option key={event.id} value={event.id}>
                    {event.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Preparation buffer · days">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={packageApply.before}
                  onChange={(event) =>
                    setPackageApply({
                      ...packageApply,
                      before: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Return buffer · days">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={packageApply.after}
                  onChange={(event) =>
                    setPackageApply({
                      ...packageApply,
                      after: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <div className="modal-actions">
              <Button>
                <Truck size={16} /> Check and reserve
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {maintenanceDraft && (
        <Modal
          title="Report maintenance issue"
          onClose={() => setMaintenanceDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const equipment = data.equipment.find(
                (item) => item.id === maintenanceDraft.equipmentId,
              );
              if (!equipment) return;
              if (
                equipment.maintenance + maintenanceDraft.quantity >
                equipment.quantity
              ) {
                setError("Unavailable quantity cannot exceed owned stock.");
                return;
              }
              if (
                await update((workspace) => ({
                  ...workspace,
                  equipment: workspace.equipment.map((item) =>
                    item.id === equipment.id
                      ? {
                          ...item,
                          maintenance:
                            item.maintenance + maintenanceDraft.quantity,
                        }
                      : item,
                  ),
                  maintenanceRecords: [
                    ...workspace.maintenanceRecords,
                    maintenanceDraft,
                  ],
                }))
              ) {
                setMaintenanceDraft(null);
                setError("");
                toast("Maintenance issue recorded and stock quarantined.");
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="Equipment">
              <select
                value={maintenanceDraft.equipmentId}
                onChange={(event) =>
                  setMaintenanceDraft({
                    ...maintenanceDraft,
                    equipmentId: event.target.value,
                  })
                }
              >
                {data.equipment.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Quantity">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maintenanceDraft.quantity}
                  onChange={(event) =>
                    setMaintenanceDraft({
                      ...maintenanceDraft,
                      quantity: Number(event.target.value),
                    })
                  }
                />
              </Field>
              <Field label="Status">
                <select
                  value={maintenanceDraft.status}
                  onChange={(event) =>
                    setMaintenanceDraft({
                      ...maintenanceDraft,
                      status: event.target.value as "Open" | "In repair",
                    })
                  }
                >
                  <option>Open</option>
                  <option>In repair</option>
                </select>
              </Field>
              <Field label="Repair cost">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={maintenanceDraft.cost}
                  onChange={(event) =>
                    setMaintenanceDraft({
                      ...maintenanceDraft,
                      cost: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Issue">
              <textarea
                required
                value={maintenanceDraft.issue}
                onChange={(event) =>
                  setMaintenanceDraft({
                    ...maintenanceDraft,
                    issue: event.target.value,
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Quarantine stock</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
