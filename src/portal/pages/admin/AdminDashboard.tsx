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
import { dateTime, errorMessage, es } from "../../lib/es";
import { supabase, type Booking } from "../../lib/supabase";

interface LoginRow {
  id: number;
  event: string;
  created_at: string;
  ip: string | null;
  profiles: { email: string | null } | null;
}
interface Stats {
  users: number;
  clients: number;
  requested: number;
  upcoming: number;
}
const eventLabel: Record<string, string> = {
  signup: "Registro",
  signed_in: "Inicio de sesión",
  signed_out: "Cierre de sesión",
};

// Mock admin dashboard: real counts and queues, minimal layout.
export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [logins, setLogins] = useState<LoginRow[]>([]);
  const [action, setAction] = useState<{
    booking: Booking;
    status: "confirmed" | "rejected";
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const count = (query: PromiseLike<{ count: number | null }>) =>
      query.then((r) => r.count ?? 0);
    const now = new Date().toISOString();
    const [users, clients, requested, upcoming, recent, loginRows] =
      await Promise.all([
        count(
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true }),
        ),
        count(
          supabase
            .from("user_roles")
            .select("user_id", { count: "exact", head: true })
            .eq("role", "client"),
        ),
        count(
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("status", "requested"),
        ),
        count(
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .eq("status", "confirmed")
            .gte("starts_at", now),
        ),
        supabase
          .from("bookings")
          .select("*, services(name), profiles:client_id(full_name,email)")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("login_events")
          .select("id,event,created_at,ip,profiles:user_id(email)")
          .order("created_at", { ascending: false })
          .limit(8),
      ]);
    setStats({ users, clients, requested, upcoming });
    setBookings((recent.data as unknown as Booking[] | null) ?? []);
    setLogins((loginRows.data as unknown as LoginRow[] | null) ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const apply = async () => {
    if (!action) return;
    setBusy(true);
    const { error } = await supabase.rpc("update_booking_status", {
      p_booking_id: action.booking.id,
      p_status: action.status,
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success(
      action.status === "confirmed"
        ? "Reserva confirmada."
        : "Reserva rechazada.",
    );
    setAction(null);
    await load();
  };

  if (!stats) return <Spinner label={es.common.loading} />;
  const cards: [string, number][] = [
    ["Usuarios", stats.users],
    ["Clientes", stats.clients],
    ["Solicitudes por revisar", stats.requested],
    ["Sesiones próximas", stats.upcoming],
  ];

  return (
    <>
      <PageHeader
        title="Panel de administración"
        description="Resumen de usuarios y reservas."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/">Abrir espacio de trabajo</a>
            </Button>
            <Button asChild>
              <Link to="/portal/book">Crear reserva</Link>
            </Button>
          </>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-k-muted">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-k-heading text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Reservas recientes</CardTitle>
          </CardHeader>
          <CardContent>
            {bookings.length === 0 ? (
              <EmptyState title="Aún no hay reservas." />
            ) : (
              <ul className="divide-y divide-k-border">
                {bookings.map((booking) => (
                  <li
                    key={booking.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <div className="grid gap-0.5 text-sm">
                      <span className="font-medium">
                        {booking.profiles?.full_name ?? booking.profiles?.email}
                      </span>
                      <span className="text-k-muted">
                        {booking.services?.name} · {dateTime(booking.starts_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={bookingTone[booking.status]}>
                        {es.bookingStatus[booking.status]}
                      </Badge>
                      {booking.status === "requested" && (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              setAction({ booking, status: "confirmed" })
                            }
                          >
                            Confirmar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setAction({ booking, status: "rejected" })
                            }
                          >
                            Rechazar
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Últimos accesos</CardTitle>
          </CardHeader>
          <CardContent>
            {logins.length === 0 ? (
              <EmptyState title="Sin accesos registrados." />
            ) : (
              <ul className="divide-y divide-k-border">
                {logins.map((row) => (
                  <li key={row.id} className="grid gap-0.5 py-2.5 text-sm">
                    <span className="font-medium">
                      {row.profiles?.email ?? "—"}
                    </span>
                    <span className="text-k-muted">
                      {eventLabel[row.event] ?? row.event} ·{" "}
                      {dateTime(row.created_at)}
                      {row.ip ? ` · ${row.ip}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => !open && setAction(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.status === "confirmed"
                ? "¿Confirmar esta reserva?"
                : "¿Rechazar esta reserva?"}
            </DialogTitle>
            <DialogDescription>
              {action &&
                `${action.booking.profiles?.full_name ?? action.booking.profiles?.email} · ${dateTime(action.booking.starts_at)}`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{es.common.cancel}</Button>
            </DialogClose>
            <Button
              variant={
                action?.status === "rejected" ? "destructive" : "default"
              }
              disabled={busy}
              onClick={() => void apply()}
            >
              {action?.status === "confirmed" ? "Confirmar" : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
