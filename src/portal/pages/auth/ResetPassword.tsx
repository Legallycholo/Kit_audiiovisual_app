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
import { useAuth } from "../../lib/auth";
import { errorMessage } from "../../lib/es";
import { supabase } from "../../lib/supabase";

export function ResetPassword() {
  const { session, loading } = useAuth();
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
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(errorMessage(updateError));
      return;
    }
    toast.success("Contraseña actualizada.");
    navigate("/portal", { replace: true });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Nueva contraseña</CardTitle>
        <CardDescription>
          Elige una contraseña de al menos 8 caracteres.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!loading && !session ? (
          <div className="grid gap-3 text-sm">
            <p>El enlace expiró o ya se usó. Solicita uno nuevo.</p>
            <Link
              className="text-k-primary hover:underline"
              to="/portal/forgot-password"
            >
              Solicitar otro enlace
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            {error && (
              <p role="alert" className="text-sm text-k-danger">
                {error}
              </p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="password">Contraseña nueva</Label>
              <Input
                id="password"
                name="password"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm">Confirmar contraseña</Label>
              <Input
                id="confirm"
                name="confirm"
                type="password"
                minLength={8}
                autoComplete="new-password"
                required
              />
            </div>
            <Button disabled={busy}>
              {busy ? "Guardando…" : "Guardar contraseña"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
