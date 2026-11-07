import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { enterWorkspace } from "./lib/workspace";
import { PortalShell } from "./layouts/PortalShell";
import { PublicLayout } from "./layouts/PublicLayout";
import { Spinner } from "./components/PageHeader";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, useAuth } from "./lib/auth";
import { es } from "./lib/es";
import type { AppRole } from "./lib/supabase";
import { AccountStatus } from "./pages/auth/AccountStatus";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { Login } from "./pages/auth/Login";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { AdminUsers } from "./pages/admin/AdminUsers";

/** Signed-in, active account, optionally limited to some roles. */
function RequireAuth({ roles }: { roles?: AppRole[] }) {
  const { loading, session, account, loadError, signOut } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner label={es.common.loading} />;
  if (!session)
    return (
      <Navigate
        to="/portal/login"
        replace
        state={{ from: location.pathname }}
      />
    );
  if (loadError || !account)
    return (
      <div
        role="alert"
        className="grid justify-items-center gap-3 p-10 text-center text-sm"
      >
        <p>{es.errors.generic}</p>
        <button
          className="text-k-primary underline"
          onClick={() => void signOut()}
        >
          {es.nav.signOut}
        </button>
      </div>
    );
  if (account.profile.account_status !== "active")
    return <Navigate to="/portal/account-status" replace />;
  if (roles && !roles.includes(account.role))
    return <Navigate to="/portal" replace />;
  return <Outlet />;
}

/** An administrator signs in once here and lands in the workspace. */
function EnterWorkspace({ accessToken }: { accessToken: string }) {
  const { signOut } = useAuth();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void enterWorkspace(accessToken).then((ok) => {
      if (cancelled) return;
      if (ok) window.location.assign("/");
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);
  if (failed)
    return (
      <PublicLayout>
        <Notice
          title="No se pudo abrir el espacio de trabajo"
          description="Revisa que el servidor de la empresa esté en marcha e inténtalo de nuevo."
        >
          <Button onClick={() => window.location.reload()}>
            {es.common.retry}
          </Button>
          <Button variant="outline" onClick={() => void signOut()}>
            {es.nav.signOut}
          </Button>
        </Notice>
      </PublicLayout>
    );
  return <Spinner label="Entrando al espacio de trabajo…" />;
}

/** A signed-in account that is not an administrator has nothing to open yet. */
function NoWorkspaceAccess() {
  const { signOut } = useAuth();
  return (
    <PublicLayout>
      <Notice
        title="Sin acceso al espacio de trabajo"
        description="Tu cuenta aún no tiene permiso para entrar. Pide a un administrador que la habilite."
      >
        <Button variant="outline" onClick={() => void signOut()}>
          {es.nav.signOut}
        </Button>
      </Notice>
    </PublicLayout>
  );
}

function Notice({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">{children}</CardContent>
    </Card>
  );
}

/** Ends the Supabase session (the workspace sends people here when they sign out). */
function Logout() {
  const { loading, session, signOut } = useAuth();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (loading || done) return;
    if (!session) {
      setDone(true);
      return;
    }
    void signOut().finally(() => setDone(true));
  }, [loading, session, signOut, done]);
  if (done) return <Navigate to="/portal/login" replace />;
  return <Spinner label={es.common.loading} />;
}

/** Sends visitors to the workspace, or to login. */
function Home() {
  const { loading, session, account } = useAuth();
  if (loading) return <Spinner label={es.common.loading} />;
  if (!session || !account) return <Navigate to="/portal/login" replace />;
  if (account.profile.account_status !== "active")
    return <Navigate to="/portal/account-status" replace />;
  if (account.role === "admin")
    return <EnterWorkspace accessToken={session.access_token} />;
  return <NoWorkspaceAccess />;
}

/** The login page bounces signed-in users onward. */
function GuestOnly() {
  const { loading, session, account } = useAuth();
  if (!loading && session && account) return <Navigate to="/portal" replace />;
  return <Outlet />;
}

export function PortalApp() {
  return (
    <AuthProvider>
      <Toaster />
      <Routes>
        <Route path="/portal" element={<Home />} />
        <Route path="/portal/logout" element={<Logout />} />
        <Route element={<PublicLayout />}>
          <Route element={<GuestOnly />}>
            <Route path="/portal/login" element={<Login />} />
          </Route>
          <Route path="/portal/forgot-password" element={<ForgotPassword />} />
          <Route path="/portal/reset-password" element={<ResetPassword />} />
          <Route path="/portal/account-status" element={<AccountStatus />} />
        </Route>
        <Route element={<RequireAuth roles={["admin"]} />}>
          <Route element={<PortalShell />}>
            <Route path="/portal/admin/users" element={<AdminUsers />} />
          </Route>
        </Route>
        <Route path="/portal/*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </AuthProvider>
  );
}
