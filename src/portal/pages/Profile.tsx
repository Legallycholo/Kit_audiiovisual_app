import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "../components/PageHeader";
import { Badge, accountTone, roleTone } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuth } from "../lib/auth";
import { es } from "../lib/es";
import { supabase } from "../lib/supabase";

export function Profile() {
  const { account, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!account) return null;
  const { profile, role } = account;

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: String(form.get("name")).trim() || null,
        phone: String(form.get("phone")).trim() || null,
        company: String(form.get("company")).trim() || null,
      })
      .eq("id", profile.id);
    setBusy(false);
    if (error) {
      toast.error(es.errors.generic);
      return;
    }
    await refresh();
    toast.success("Perfil actualizado.");
  };

  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader title="Tu perfil" description={profile.email ?? undefined} />
      <Card>
        <CardHeader>
          <CardTitle>Cuenta</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Badge tone={roleTone[role]}>{es.roles[role]}</Badge>
          <Badge tone={accountTone[profile.account_status]}>
            {es.accountStatus[profile.account_status]}
          </Badge>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="grid gap-4" key={profile.id}>
            <div className="grid gap-1.5">
              <Label htmlFor="name">Nombre completo</Label>
              <Input
                id="name"
                name="name"
                defaultValue={profile.full_name ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                defaultValue={profile.phone ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="company">Empresa ({es.common.optional})</Label>
              <Input
                id="company"
                name="company"
                defaultValue={profile.company ?? ""}
              />
            </div>
            <div>
              <Button disabled={busy}>
                {busy ? "Guardando…" : es.common.save}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
