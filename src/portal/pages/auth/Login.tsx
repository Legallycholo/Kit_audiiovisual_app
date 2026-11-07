import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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

export function Login() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    if (signInError) {
      setBusy(false);
      setError(errorMessage(signInError));
      return;
    }
    // Server-side record with IP and user agent; failure must not block sign-in.
    await supabase.rpc("log_auth_event", { p_event: "signed_in" });
    toast.success("Sesión iniciada.");
    navigate(from ?? "/portal", { replace: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Te damos la bienvenida</CardTitle>
        <CardDescription>
          Inicia sesión para reservar y administrar tus sesiones.
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
              autoComplete="current-password"
              required
            />
          </div>
          <Button disabled={busy || !supabaseConfigured}>
            {busy ? "Entrando…" : "Iniciar sesión"}
          </Button>
          <div className="flex justify-between text-sm">
            <Link
              className="text-k-primary hover:underline"
              to="/portal/forgot-password"
            >
              ¿Olvidaste tu contraseña?
            </Link>
            <Link
              className="text-k-primary hover:underline"
              to="/portal/signup"
            >
              Crear cuenta
            </Link>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
