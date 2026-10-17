import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWorkspace } from "../../shared/store";
import { availableStock, id, inventoryConflicts } from "../../shared/domain";
import type {
  Equipment,
  EquipmentPackage,
  MaintenanceRecord,
  Reservation,
} from "../../shared/types";
import { moveDate } from "./helpers";

export function useInventoryView() {
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
  return {
    data,
    update,
    toast,
    mode,
    user,
    request,
    canPrice,
    params,
    tab,
    setTab,
    search,
    setSearch,
    category,
    setCategory,
    draft,
    setDraft,
    reservation,
    setReservation,
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
    today,
    start,
    setStart,
    end,
    setEnd,
    availability,
    setAvailability,
    availabilityError,
    setAvailabilityError,
    available,
    conflicts,
    items,
    addReservation,
  };
}
export type InventoryView = ReturnType<typeof useInventoryView>;
