import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, PageHeader, Spinner } from "../../components/PageHeader";
import { Badge, bookingTone } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { useAuth } from "../../lib/auth";
import { dateTime, errorMessage, es } from "../../lib/es";
import { supabase, type Booking } from "../../lib/supabase";

// Mock client dashboard: real data, minimal layout.
export function ClientDashboard() {
  const { account } = useAuth();
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("bookings")
      .select("*, services(name)")
      .order("starts_at", { ascending: false });
    if (error) toast.error(es.errors.generic);
    setBookings((data as Booking[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const cancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    const { error } = await supabase.rpc("update_booking_status", {
      p_booking_id: cancelling.id,
      p_status: "cancelled",
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Reserva cancelada.");
    setCancelling(null);
    await load();
  };

  if (!bookings) return <Spinner label={es.common.loading} />;
  const open = bookings.filter(
    (b) => b.status === "requested" || b.status === "confirmed",
  );
  const next = open
    .filter((b) => new Date(b.starts_at) > new Date())
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];

  return (
    <>
      <PageHeader
        title={`Hola, ${account?.profile.full_name?.split(" ")[0] ?? ""}`.trim()}
        description="Tus próximas sesiones y solicitudes."
        actions={
          <Button asChild>
            <Link to="/portal/book">Reservar otra sesión</Link>
          </Button>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Próxima sesión</CardTitle>
          </CardHeader>
          <CardContent>
            {next ? (
              <p className="text-sm">
                <span className="font-medium">{next.services?.name}</span>
                <br />
                {dateTime(next.starts_at)}
              </p>
            ) : (
              <p className="text-sm text-k-muted">Sin sesiones próximas.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Solicitudes abiertas</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-k-heading text-3xl font-semibold">
              {open.length}
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Mis reservas</CardTitle>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <EmptyState title="Todavía no tienes reservas." />
          ) : (
            <ul className="divide-y divide-k-border">
              {bookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="grid gap-0.5 text-sm">
                    <span className="font-medium">
                      {booking.services?.name}
                    </span>
                    <span className="text-k-muted">
                      {dateTime(booking.starts_at)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge tone={bookingTone[booking.status]}>
                      {es.bookingStatus[booking.status]}
                    </Badge>
                    {(booking.status === "requested" ||
                      booking.status === "confirmed") && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCancelling(booking)}
                      >
                        Cancelar
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={cancelling !== null}
        onOpenChange={(open) => !open && setCancelling(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Cancelar esta reserva?</DialogTitle>
            <DialogDescription>
              {cancelling &&
                `${cancelling.services?.name} · ${dateTime(cancelling.starts_at)}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Mantener reserva</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void cancel()}
            >
              Cancelar reserva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
