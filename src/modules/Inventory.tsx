import { canEditCollection } from "../shared/access";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Plus,
  Wrench,
  CalendarDays,
  PackageCheck,
  Truck,
} from "lucide-react";
import { useWorkspace, activity } from "../shared/store";
import {
  Badge,
  Button,
  Empty,
  ErrorNote,
  Field,
  Modal,
  PageHeader,
  Panel,
  SearchField,
  Tabs,
} from "../shared/ui";
import {
  availableStock,
  id,
  inventoryConflicts,
  money,
  shortDate,
  validateReservation,
} from "../shared/domain";
import type {
  Equipment,
  EquipmentPackage,
  MaintenanceRecord,
  Reservation,
} from "../shared/types";

const moveDate = (value: string, days: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export function Inventory() {
  const { data, update, toast, mode, user, request } = useWorkspace();
  const canPrice =
    !user ||
    ["Administrator", "Sales Manager", "Production Manager"].includes(
      user.role,
    );
  const [params] = useSearchParams();
  const [tab, setTab] = useState(
    params.has("event") ? "Reservations" : "Catalog",
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [draft, setDraft] = useState<Equipment | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [fulfillment, setFulfillment] = useState<Reservation | null>(null);
  const [packageDraft, setPackageDraft] = useState<EquipmentPackage | null>(
    null,
  );
  const [packageApply, setPackageApply] = useState<{
    packageId: string;
    eventId: string;
    before: number;
    after: number;
  } | null>(null);
  const [maintenanceDraft, setMaintenanceDraft] =
    useState<MaintenanceRecord | null>(null);
  const [error, setError] = useState("");
  const today = new Date().toLocaleDateString("en-CA");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [availability, setAvailability] = useState<Record<
    string,
    number
  > | null>(null);
  const [availabilityError, setAvailabilityError] = useState("");
  useEffect(() => {
    let active = true;
    setAvailability(null);
    setAvailabilityError("");
    if (mode === "company" && tab === "Availability")
      request<{ availability: Record<string, number> }>(
        `/inventory/availability?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      )
        .then((result) => {
          if (active) setAvailability(result.availability);
        })
        .catch((e) => {
          if (active) setAvailabilityError(e.message);
        });
    return () => {
      active = false;
    };
  }, [mode, tab, start, end, data.reservations, data.equipment, request]);
  const available = (q: Equipment) =>
    mode === "sample"
      ? availableStock(q, data.reservations, start, end)
      : availability?.[q.id];
  const conflicts = inventoryConflicts(data);
  const items = data.equipment.filter(
    (q) =>
      `${q.name} ${q.sku}`.toLowerCase().includes(search.toLowerCase()) &&
      (category === "All categories" || q.category === category) &&
      (tab !== "Maintenance" || q.maintenance > 0),
  );
  const addReservation = () => {
    const event =
      data.events.find((e) => e.id === params.get("event")) || data.events[0];
    setError("");
    setReservation({
      id: id(),
      eventId: event?.id || "",
      equipmentId: data.equipment[0]?.id || "",
      quantity: 1,
      start: event ? moveDate(event.date, -1) : today,
      end: event ? moveDate(event.endDate, 1) : today,
      status: "Hold",
      source: "Owned",
      bufferBeforeDays: 1,
      bufferAfterDays: 1,
    });
  };
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
      <Panel>
        <div className="list-toolbar">
          <Tabs
            items={[
              "Catalog",
              "Availability",
              "Reservations",
              "Maintenance",
              "Packages",
            ]}
            value={tab}
            onChange={setTab}
          />
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="Search equipment…"
          />
        </div>
        {tab !== "Reservations" && tab !== "Packages" && (
          <div className="filter-row">
            <select
              aria-label="Equipment category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>All categories</option>
              {Array.from(new Set(data.equipment.map((q) => q.category))).map(
                (c) => (
                  <option key={c}>{c}</option>
                ),
              )}
            </select>
            {tab === "Availability" && (
              <>
                <Field label="Occupied from">
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </Field>
                <Field label="Through return">
                  <input
                    type="date"
                    min={start}
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </Field>
                <span className="tiny muted">
                  Includes holds and maintenance.
                </span>
              </>
            )}
          </div>
        )}
        {tab === "Packages" ? (
          <div className="panel-body">
            <div className="section-heading">
              <div>
                <h2>Paquetes de equipos reutilizables</h2>
                <p>
                  Reserva un grupo revisado de equipos propios en un solo paso.
                </p>
              </div>
              <Button
                disabled={!canEditCollection(user, "packages")}
                onClick={() =>
                  setPackageDraft({
                    id: id(),
                    name: "",
                    description: "",
                    active: true,
                    items: data.equipment[0]
                      ? [{ equipmentId: data.equipment[0].id, quantity: 1 }]
                      : [],
                  })
                }
              >
                <Plus size={16} /> Add package
              </Button>
            </div>
            {data.packages.map((equipmentPackage) => (
              <div className="simple-row" key={equipmentPackage.id}>
                <PackageCheck size={21} />
                <div>
                  <strong>{equipmentPackage.name}</strong>
                  <small>
                    {equipmentPackage.items
                      .map(
                        (item) =>
                          `${item.quantity} × ${data.equipment.find((equipment) => equipment.id === item.equipmentId)?.name || "Unknown"}`,
                      )
                      .join(" · ")}
                  </small>
                </div>
                <Badge tone={equipmentPackage.active ? "green" : "neutral"}>
                  {equipmentPackage.active ? "Active" : "Inactive"}
                </Badge>
                <Button
                  variant="ghost"
                  disabled={!canEditCollection(user, "packages")}
                  onClick={() =>
                    setPackageDraft(structuredClone(equipmentPackage))
                  }
                >
                  Edit
                </Button>
                <Button
                  variant="secondary"
                  disabled={
                    !equipmentPackage.active ||
                    !canEditCollection(user, "reservations") ||
                    data.events.length === 0
                  }
                  onClick={() =>
                    setPackageApply({
                      packageId: equipmentPackage.id,
                      eventId: params.get("event") || data.events[0]?.id || "",
                      before: 1,
                      after: 1,
                    })
                  }
                >
                  Reserve package
                </Button>
              </div>
            ))}
            {data.packages.length === 0 && (
              <Empty
                title="No equipment packages yet"
                description="Create a reusable group from catalog equipment."
              />
            )}
          </div>
        ) : tab === "Reservations" ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipment / event</th>
                  <th>Qty</th>
                  <th>Occupied window</th>
                  <th>Status</th>
                  <th>Update</th>
                </tr>
              </thead>
              <tbody>
                {data.reservations
                  .filter(
                    (r) =>
                      !params.get("event") || r.eventId === params.get("event"),
                  )
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>
                          {
                            data.equipment.find((q) => q.id === r.equipmentId)
                              ?.name
                          }
                        </strong>
                        <small>
                          {data.events.find((e) => e.id === r.eventId)?.name}
                        </small>
                      </td>
                      <td>{r.quantity}</td>
                      <td>
                        {shortDate(r.start)} – {shortDate(r.end)}
                      </td>
                      <td>
                        <Badge>{r.status}</Badge>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          disabled={
                            !canEditCollection(user, "reservations") ||
                            ["Returned", "Cancelled"].includes(r.status)
                          }
                          onClick={() =>
                            setFulfillment({
                              ...r,
                              source: r.source || "Owned",
                              dispatchedQuantity:
                                r.dispatchedQuantity ||
                                (r.status === "Dispatched" ? r.quantity : 0),
                              returnedQuantity: r.returnedQuantity || 0,
                              damagedQuantity: r.damagedQuantity || 0,
                              custodyNote: r.custodyNote || "",
                            })
                          }
                        >
                          Manage handoff
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : tab === "Maintenance" ? (
          <div className="panel-body">
            <div className="section-heading">
              <div>
                <h2>Mantenimiento y equipos dañados</h2>
                <p>
                  Los registros abiertos permanecen fuera del inventario
                  disponible.
                </p>
              </div>
              <Button
                disabled={!canEditCollection(user, "maintenanceRecords")}
                onClick={() =>
                  setMaintenanceDraft({
                    id: id(),
                    equipmentId: data.equipment[0]?.id || "",
                    quantity: 1,
                    issue: "",
                    status: "Open",
                    openedAt: new Date().toISOString(),
                    cost: 0,
                  })
                }
              >
                <Wrench size={16} /> Report issue
              </Button>
            </div>
            {data.maintenanceRecords.map((record) => (
              <div className="simple-row" key={record.id}>
                <Wrench size={20} />
                <div>
                  <strong>
                    {record.quantity} ×{" "}
                    {
                      data.equipment.find(
                        (item) => item.id === record.equipmentId,
                      )?.name
                    }
                  </strong>
                  <small>
                    {record.issue} · {money(record.cost)}
                  </small>
                </div>
                <Badge tone={record.status === "Resolved" ? "green" : "amber"}>
                  {record.status}
                </Badge>
                {record.status !== "Resolved" && (
                  <Button
                    variant="secondary"
                    disabled={!canEditCollection(user, "maintenanceRecords")}
                    onClick={async () => {
                      const equipment = data.equipment.find(
                        (item) => item.id === record.equipmentId,
                      );
                      if (!equipment) return;
                      if (
                        await update((workspace) => ({
                          ...workspace,
                          equipment: workspace.equipment.map((item) =>
                            item.id === equipment.id
                              ? {
                                  ...item,
                                  maintenance: Math.max(
                                    0,
                                    item.maintenance - record.quantity,
                                  ),
                                }
                              : item,
                          ),
                          maintenanceRecords: workspace.maintenanceRecords.map(
                            (item) =>
                              item.id === record.id
                                ? {
                                    ...item,
                                    status: "Resolved",
                                    resolvedAt: new Date().toISOString(),
                                  }
                                : item,
                          ),
                        }))
                      )
                        toast("Maintenance resolved and stock restored.");
                    }}
                  >
                    Resolve
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Equipment</th>
                  <th>Category</th>
                  <th>Owned</th>
                  <th>
                    {tab === "Availability"
                      ? "Available in window"
                      : "Maintenance"}
                  </th>
                  {canPrice && <th>Rate / day</th>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((q) => (
                  <tr key={q.id}>
                    <td>
                      <div className="record-cell">
                        <span className="equipment-icon">
                          <Box size={22} />
                        </span>
                        <span>
                          <strong>{q.name}</strong>
                          <small>{q.sku}</small>
                        </span>
                      </div>
                    </td>
                    <td>{q.category}</td>
                    <td>{q.quantity}</td>
                    <td>
                      {tab === "Availability" ? (
                        <Badge tone={(available(q) ?? 0) > 0 ? "green" : "red"}>
                          {available(q) ?? "…"}{" "}
                          {available(q) === undefined
                            ? "por consultar"
                            : "disponibles"}
                        </Badge>
                      ) : q.maintenance > 0 ? (
                        <Badge tone="amber">{q.maintenance} unavailable</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    {canPrice && <td className="amount">{money(q.rate)}</td>}
                    <td>
                      <Button
                        disabled={!canEditCollection(user, "equipment")}
                        variant="ghost"
                        onClick={() => setDraft({ ...q })}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && (
              <Empty
                title="No equipment in this view"
                description="Adjust your filters or add an equipment record."
              />
            )}
          </div>
        )}
        <div className="table-footer">
          Company-owned rental stock<span>Sample rates · USD / day</span>
        </div>
      </Panel>
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
                    <option key={c}>{c}</option>
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
