import { activity } from "../../shared/store";
import { Button, ErrorNote, Field, Modal } from "../../shared/ui";
import { validateReservation } from "../../shared/domain";
import type { Equipment, Reservation } from "../../shared/types";
import { moveDate } from "./helpers";
import { WebLookup } from "../WebLookup";
import type { InventoryView } from "./inventory-view";
import { uiLabel } from "../../shared/i18n";

export function InventoryRecordDialogs({ ctx }: { ctx: InventoryView }) {
  const {
    data,
    update,
    toast,
    draft,
    setDraft,
    reservation,
    setReservation,
    error,
    setError,
  } = ctx;
  return (
    <>
      {draft && (
        <Modal
          title="Equipment record"
          onClose={() => {
            setDraft(null);
            setError("");
          }}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (draft.maintenance > draft.quantity) {
                setError("Maintenance quantity cannot exceed owned stock.");
                return;
              }
              if (
                !(await update((s) => ({
                  ...s,
                  equipment: s.equipment.some((q) => q.id === draft.id)
                    ? s.equipment.map((q) => (q.id === draft.id ? draft : q))
                    : [...s.equipment, draft],
                })))
              )
                return;
              setDraft(null);
              setError("");
              toast("Equipment saved.");
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            {!data.equipment.some((q) => q.id === draft.id) && (
              <WebLookup
                kind="equipment"
                onUse={(found) =>
                  setDraft({
                    ...draft,
                    name: found.title,
                    description: [
                      draft.description,
                      found.subtitle ? `Referencia web: ${found.subtitle}` : "",
                    ]
                      .filter(Boolean)
                      .join("\n"),
                  })
                }
              />
            )}
            <Field label="Equipment name">
              <input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              <Field label="Identification / SKU">
                <input
                  required
                  value={draft.sku}
                  onChange={(e) => setDraft({ ...draft, sku: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                >
                  {[
                    "Audio",
                    "Lighting",
                    "Video",
                    "LED walls",
                    "Projectors",
                    "Screens",
                    "Staging",
                    "Trusses and rigging",
                    "Cables",
                    "Accessories",
                    "Other",
                  ].map((c) => (
                    <option key={c} value={c}>
                      {uiLabel(c)}
                    </option>
                  ))}
                </select>
              </Field>
              {(["quantity", "maintenance", "rate"] as const).map((k) => (
                <Field
                  key={k}
                  label={
                    k === "quantity"
                      ? "Owned quantity"
                      : k === "maintenance"
                        ? "Unavailable / maintenance"
                        : "Daily rental rate · USD"
                  }
                >
                  <input
                    required
                    type="number"
                    min="0"
                    step={k === "rate" ? ".01" : "1"}
                    value={draft[k]}
                    onChange={(e) =>
                      setDraft({ ...draft, [k]: Number(e.target.value) })
                    }
                  />
                </Field>
              ))}
            </div>
            <Field label="Specifications">
              <textarea
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Save equipment</Button>
            </div>
          </form>
        </Modal>
      )}
      {reservation && (
        <Modal
          title="Reserve equipment"
          description="Include preparation, transport, and return time in the occupied window."
          onClose={() => setReservation(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const item = data.equipment.find(
                  (q) => q.id === reservation.equipmentId,
                );
                if (!item) throw new Error("Select equipment first.");
                validateReservation(item, data.reservations, reservation);
                if (
                  !(await update((s) => ({
                    ...s,
                    reservations: [...s.reservations, reservation],
                    activity: [
                      activity(
                        "Equipment reserved",
                        `${reservation.quantity} × ${item.name}`,
                        reservation.eventId,
                      ),
                      ...s.activity,
                    ],
                  })))
                )
                  return;
                setReservation(null);
                toast("Equipment allocation saved.");
              } catch (err) {
                setError((err as Error).message);
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="Event">
              <select
                required
                value={reservation.eventId}
                onChange={(e) => {
                  const event = data.events.find(
                    (item) => item.id === e.target.value,
                  );
                  setReservation({
                    ...reservation,
                    eventId: e.target.value,
                    start: event
                      ? moveDate(
                          event.date,
                          -(reservation.bufferBeforeDays || 0),
                        )
                      : reservation.start,
                    end: event
                      ? moveDate(
                          event.endDate,
                          reservation.bufferAfterDays || 0,
                        )
                      : reservation.end,
                  });
                }}
              >
                {data.events.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Equipment">
              <select
                required
                value={reservation.equipmentId}
                onChange={(e) =>
                  setReservation({
                    ...reservation,
                    equipmentId: e.target.value,
                  })
                }
              >
                {data.equipment.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Inventory source">
                <select
                  value={reservation.source || "Owned"}
                  onChange={(e) =>
                    setReservation({
                      ...reservation,
                      source: e.target.value as "Owned" | "Supplier",
                      supplier:
                        e.target.value === "Supplier"
                          ? reservation.supplier || ""
                          : undefined,
                      supplierReference:
                        e.target.value === "Supplier"
                          ? reservation.supplierReference || ""
                          : undefined,
                      unitCost:
                        e.target.value === "Supplier"
                          ? reservation.unitCost || 0
                          : undefined,
                    })
                  }
                >
                  <option value="Owned">Owned stock</option>
                  <option value="Supplier">Supplier rental</option>
                </select>
              </Field>
              <Field label="Quantity">
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={reservation.quantity}
                  onChange={(e) =>
                    setReservation({
                      ...reservation,
                      quantity: Number(e.target.value),
                    })
                  }
                />
              </Field>
              {reservation.source === "Supplier" && (
                <>
                  <Field label="Supplier">
                    <input
                      required
                      value={reservation.supplier || ""}
                      onChange={(e) =>
                        setReservation({
                          ...reservation,
                          supplier: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Supplier reference">
                    <input
                      value={reservation.supplierReference || ""}
                      onChange={(e) =>
                        setReservation({
                          ...reservation,
                          supplierReference: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="Actual unit cost">
                    <input
                      type="number"
                      min="0"
                      step=".01"
                      value={reservation.unitCost || 0}
                      onChange={(e) =>
                        setReservation({
                          ...reservation,
                          unitCost: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </>
              )}
              <Field label="Preparation buffer · days">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={reservation.bufferBeforeDays || 0}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    const event = data.events.find(
                      (item) => item.id === reservation.eventId,
                    );
                    setReservation({
                      ...reservation,
                      bufferBeforeDays: value,
                      start: event
                        ? moveDate(event.date, -value)
                        : reservation.start,
                    });
                  }}
                />
              </Field>
              <Field label="Return buffer · days">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={reservation.bufferAfterDays || 0}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    const event = data.events.find(
                      (item) => item.id === reservation.eventId,
                    );
                    setReservation({
                      ...reservation,
                      bufferAfterDays: value,
                      end: event
                        ? moveDate(event.endDate, value)
                        : reservation.end,
                    });
                  }}
                />
              </Field>
              <Field label="Allocation status">
                <select
                  value={reservation.status}
                  onChange={(e) =>
                    setReservation({
                      ...reservation,
                      status: e.target.value as Reservation["status"],
                    })
                  }
                >
                  <option>Hold</option>
                  <option>Confirmed</option>
                </select>
              </Field>
              <Field label="Preparation starts">
                <input
                  type="date"
                  required
                  value={reservation.start}
                  onChange={(e) =>
                    setReservation({ ...reservation, start: e.target.value })
                  }
                />
              </Field>
              <Field label="Return & inspection ends">
                <input
                  type="date"
                  required
                  min={reservation.start}
                  value={reservation.end}
                  onChange={(e) =>
                    setReservation({ ...reservation, end: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="modal-actions">
              <Button>Check availability & reserve</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
