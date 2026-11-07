import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { EmptyState, PageHeader, Spinner } from "../components/PageHeader";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input, Textarea } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { homeFor, useAuth } from "../lib/auth";
import { errorMessage, es } from "../lib/es";
import { supabase, type Service } from "../lib/supabase";
import { cn } from "../lib/utils";

// Mock booking page: one screen. The multi-step flow (service → slot → details →
// review) and real availability slots come in the booking-engine phase.
export function Book() {
  const { account, refresh } = useAuth();
  const navigate = useNavigate();
  const [services, setServices] = useState<Service[] | null>(null);
  const [serviceId, setServiceId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase
      .from("services")
      .select("id,name,slug,description,duration_minutes")
      .eq("active", true)
      .order("sort")
      .then(({ data, error }) => {
        if (error) toast.error(es.errors.generic);
        setServices((data as Service[] | null) ?? []);
      });
  }, []);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const { error } = await supabase.rpc("create_booking", {
      p_service_id: serviceId,
      p_starts_at: new Date(String(form.get("when"))).toISOString(),
      p_notes: String(form.get("notes")) || null,
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    toast.success("Solicitud enviada. Te confirmaremos pronto.");
    await refresh();
    // The first booking promotes the account to client; go to its dashboard.
    navigate(account?.role === "admin" ? homeFor("admin") : homeFor("client"));
  };

  if (!services) return <Spinner label={es.common.loading} />;

  return (
    <div className="grid max-w-2xl gap-2">
      <PageHeader
        title="Reserva una sesión"
        description="Elige el servicio y el horario que prefieres. Confirmaremos tu solicitud."
      />
      {services.length === 0 ? (
        <Card>
          <EmptyState title="Aún no hay servicios disponibles." />
        </Card>
      ) : (
        <form onSubmit={submit} className="grid gap-6">
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm font-medium">Servicio</legend>
            {services.map((service) => (
              <label key={service.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="service"
                  className="peer sr-only"
                  checked={serviceId === service.id}
                  onChange={() => setServiceId(service.id)}
                  required
                />
                <Card
                  className={cn(
                    "peer-checked:border-k-primary peer-checked:ring-2 peer-checked:ring-k-primary peer-focus-visible:ring-2 peer-focus-visible:ring-k-focus",
                  )}
                >
                  <CardContent className="grid gap-1 p-4">
                    <span className="font-k-heading font-semibold">
                      {service.name}
                    </span>
                    <span className="text-sm text-k-muted">
                      {service.duration_minutes} min
                      {service.description ? ` · ${service.description}` : ""}
                    </span>
                  </CardContent>
                </Card>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-1.5">
            <Label htmlFor="when">Fecha y hora</Label>
            <Input id="when" name="when" type="datetime-local" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="notes">Notas ({es.common.optional})</Label>
            <Textarea id="notes" name="notes" maxLength={1000} />
          </div>
          <div>
            <Button size="lg" disabled={busy || !serviceId}>
              {busy ? "Enviando…" : "Solicitar reserva"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
