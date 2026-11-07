import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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
import { errorMessage } from "../../lib/es";
import { supabase } from "../../lib/supabase";

export function ForgotPassword() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/portal/reset-password`,
    });
    setBusy(false);
    if (error) {
      toast.error(errorMessage(error));
      return;
    }
    // Same message whether or not the email exists.
    setSent(true);
    toast.success("Si el correo existe, te enviamos un enlace.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Recupera tu contraseña</CardTitle>
        <CardDescription>
          Te enviaremos un enlace para crear una contraseña nueva.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sent ? (
          <p className="text-sm">
            Revisa tu correo y abre el enlace que te enviamos.
          </p>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
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
            <Button disabled={busy}>
              {busy ? "Enviando…" : "Enviar enlace"}
            </Button>
          </form>
        )}
        <p className="mt-4 text-sm">
          <Link className="text-k-primary hover:underline" to="/portal/login">
            Volver a iniciar sesión
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
