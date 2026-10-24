import { canEditCollection } from "../../shared/access";
import { Box, Plus, Wrench, PackageCheck } from "lucide-react";
import {
  Badge,
  Button,
  Empty,
  Field,
  Panel,
  SearchField,
  Tabs,
} from "../../shared/ui";
import { id, money, shortDate } from "../../shared/domain";
import type { Equipment } from "../../shared/types";
import type { InventoryView } from "./inventory-view";
import { uiLabel } from "../../shared/i18n";

export function InventoryCatalog({ ctx }: { ctx: InventoryView }) {
  const {
    data,
    update,
    toast,
    user,
    canPrice,
    params,
    tab,
    setTab,
    search,
    setSearch,
    category,
    setCategory,
    setDraft,
    setFulfillment,
    setPackageDraft,
    setPackageApply,
    setMaintenanceDraft,
    start,
    setStart,
    end,
    setEnd,
    available,
    items,
  } = ctx;
  return (
    <>
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
          <SearchField value={search} onChange={setSearch} />
        </div>
        {tab !== "Reservations" && tab !== "Packages" && (
          <div className="filter-row">
            <select
              aria-label={uiLabel("Equipment category")}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="All categories">
                {uiLabel("All categories")}
              </option>
              {Array.from(new Set(data.equipment.map((q) => q.category))).map(
                (c) => (
                  <option key={c} value={c}>
                    {uiLabel(c)}
                  </option>
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
                  <th>{uiLabel("Equipment")}</th>
                  <th>{uiLabel("Category")}</th>
                  <th>{uiLabel("Owned")}</th>
                  <th>
                    {tab === "Availability"
                      ? "Available in window"
                      : "Maintenance"}
                  </th>
                  {canPrice && <th>{uiLabel("Rate / day")}</th>}
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
                    <td>{uiLabel(q.category)}</td>
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
          {uiLabel("Company-owned rental stock")}
          <span>{uiLabel("Rates · USD / day")}</span>
        </div>
      </Panel>
    </>
  );
}
