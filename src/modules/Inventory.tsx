import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Plus, Wrench, CalendarDays } from "lucide-react";
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
  money,
  shortDate,
  validateReservation,
} from "../shared/domain";
import type { Equipment, Reservation } from "../shared/types";
export function Inventory() {
  const { data, update, toast } = useWorkspace();
  const [params] = useSearchParams();
  const [tab, setTab] = useState(
    params.has("event") ? "Reservations" : "Catalog",
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All categories");
  const [draft, setDraft] = useState<Equipment | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [error, setError] = useState("");
  const today = new Date().toLocaleDateString("en-CA");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
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
      start: event?.date || today,
      end: event?.endDate || today,
      status: "Hold",
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
            <Button variant="secondary" onClick={addReservation}>
              <CalendarDays size={17} />
              Reserve equipment
            </Button>
            <Button
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
          <Empty
            title="Build repeatable equipment packages"
            description="Package composition and package pricing will be added after your stock and rental conventions are confirmed."
          />
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
                        <select
                          aria-label={`Reservation status ${r.id}`}
                          value={r.status}
                          onChange={(e) => {
                            const next = {
                              ...r,
                              status: e.target.value as Reservation["status"],
                            };
                            try {
                              if (
                                !["Returned", "Cancelled"].includes(next.status)
                              )
                                validateReservation(
                                  data.equipment.find(
                                    (q) => q.id === r.equipmentId,
                                  )!,
                                  data.reservations,
                                  next,
                                );
                              update((s) => ({
                                ...s,
                                reservations: s.reservations.map((x) =>
                                  x.id === r.id ? next : x,
                                ),
                                activity: [
                                  activity(
                                    "Equipment allocation updated",
                                    `${r.quantity} units · ${next.status}`,
                                    r.eventId,
                                  ),
                                  ...s.activity,
                                ],
                              }));
                              toast("Reservation updated.");
                            } catch (err) {
                              toast((err as Error).message);
                            }
                          }}
                        >
                          {[
                            "Hold",
                            "Confirmed",
                            "Dispatched",
                            "Returned",
                            "Cancelled",
                          ].map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
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
                  <th>Rate / day</th>
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
                        <Badge
                          tone={
                            availableStock(q, data.reservations, start, end) > 0
                              ? "green"
                              : "red"
                          }
                        >
                          {availableStock(q, data.reservations, start, end)}{" "}
                          available
                        </Badge>
                      ) : q.maintenance > 0 ? (
                        <Badge tone="amber">{q.maintenance} unavailable</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="amount">{money(q.rate)}</td>
                    <td>
                      <Button
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
            onSubmit={(e) => {
              e.preventDefault();
              if (draft.maintenance > draft.quantity) {
                setError("Maintenance quantity cannot exceed owned stock.");
                return;
              }
              update((s) => ({
                ...s,
                equipment: s.equipment.some((q) => q.id === draft.id)
                  ? s.equipment.map((q) => (q.id === draft.id ? draft : q))
                  : [...s.equipment, draft],
              }));
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
            onSubmit={(e) => {
              e.preventDefault();
              try {
                const item = data.equipment.find(
                  (q) => q.id === reservation.equipmentId,
                );
                if (!item) throw new Error("Select equipment first.");
                validateReservation(item, data.reservations, reservation);
                update((s) => ({
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
                }));
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
                onChange={(e) =>
                  setReservation({ ...reservation, eventId: e.target.value })
                }
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
