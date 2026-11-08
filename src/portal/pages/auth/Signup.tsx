import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { errorMessage, es } from "../../lib/es";
import { supabase, supabaseConfigured } from "../../lib/supabase";

/**
 * Self-service account request. The database gives every new account the
 * "user" role (nothing here can choose a role), and with approval required
 * (app_settings.require_account_approval) it starts as "pending" until an
 * administrator approves it in Usuarios y accesos.
 */
export function Signup() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setError("");
    // Role is NOT sent: the database assigns "user" to every new account.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: String(form.get("email")).trim(),
      password,
      options: {
        data: { full_name: String(form.get("name")).trim() },
        emailRedirectTo: `${window.location.origin}/portal/login`,
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(errorMessage(signUpError));
      return;
    }
    if (data.session) {
      await supabase.rpc("log_auth_event", { p_event: "signed_in" });
      toast.success("Cuenta creada.");
      navigate("/portal", { replace: true });
    } else {
      toast.success("Cuenta creada. Revisa tu correo para confirmarla.");
      navigate("/portal/login", { replace: true });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Crea tu cuenta</CardTitle>
        <CardDescription>
          Un administrador revisará tu solicitud antes de darte acceso al
          espacio de trabajo.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          {!supabaseConfigured && (
            <p role="alert" className="text-sm text-k-danger">
              {es.errors.not_configured}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-k-danger">
              {error}
            </p>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="name">Nombre completo</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="confirm">Confirmar contraseña</Label>
            <Input
              id="confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button disabled={busy || !supabaseConfigured}>
            {busy ? "Creando…" : "Crear cuenta"}
          </Button>
          <p className="text-sm text-k-muted">
            Guardamos tu correo y los datos de acceso (IP y dispositivo) para la
            seguridad de tu cuenta.
          </p>
          <p className="text-sm">
            ¿Ya tienes cuenta?{" "}
            <Link className="text-k-primary hover:underline" to="/portal/login">
              Inicia sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
