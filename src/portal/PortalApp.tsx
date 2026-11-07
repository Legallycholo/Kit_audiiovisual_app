import { useEffect, useState } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { enterWorkspace } from "./lib/workspace";
import { PortalShell } from "./layouts/PortalShell";
import { PublicLayout } from "./layouts/PublicLayout";
import { Spinner } from "./components/PageHeader";
import { Toaster } from "./components/ui/sonner";
import { AuthProvider, homeFor, useAuth } from "./lib/auth";
import { es } from "./lib/es";
import type { AppRole } from "./lib/supabase";
import { AccountStatus } from "./pages/auth/AccountStatus";
import { ForgotPassword } from "./pages/auth/ForgotPassword";
import { Login } from "./pages/auth/Login";
import { ResetPassword } from "./pages/auth/ResetPassword";
import { Signup } from "./pages/auth/Signup";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminUsers } from "./pages/admin/AdminUsers";
import { Book } from "./pages/Book";
import { ClientDashboard } from "./pages/client/ClientDashboard";
import { Profile } from "./pages/Profile";

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
    return <Navigate to={homeFor(account.role)} replace />;
  return <Outlet />;
}

/** An administrator is the boss of the workspace: sign them in there and open its home. */
function EnterWorkspace({ accessToken }: { accessToken: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void enterWorkspace(accessToken).then((ok) => {
      if (cancelled) return;
      if (ok) {
        window.location.assign("/");
      } else {
        toast.error(
          "No se pudo abrir el espacio de trabajo. Abrimos el panel del portal.",
        );
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);
  // If the hand-over fails the admin still gets the portal dashboard, never a dead end.
  if (failed) return <Navigate to="/portal/admin" replace />;
  return <Spinner label="Entrando al espacio de trabajo…" />;
}

/** Sends visitors to the right home, or to login. */
function Home() {
  const { loading, session, account } = useAuth();
  if (loading) return <Spinner label={es.common.loading} />;
  if (!session || !account) return <Navigate to="/portal/login" replace />;
  if (account.profile.account_status !== "active")
    return <Navigate to="/portal/account-status" replace />;
  if (account.role === "admin")
    return <EnterWorkspace accessToken={session.access_token} />;
  return <Navigate to={homeFor(account.role)} replace />;
}

/** Login/signup pages bounce signed-in users to their home. */
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
        <Route element={<PublicLayout />}>
          <Route element={<GuestOnly />}>
            <Route path="/portal/login" element={<Login />} />
            <Route path="/portal/signup" element={<Signup />} />
          </Route>
          <Route path="/portal/forgot-password" element={<ForgotPassword />} />
          <Route path="/portal/reset-password" element={<ResetPassword />} />
          <Route path="/portal/account-status" element={<AccountStatus />} />
        </Route>
        <Route element={<RequireAuth />}>
          <Route element={<PortalShell />}>
            <Route path="/portal/profile" element={<Profile />} />
            <Route path="/portal/book" element={<Book />} />
          </Route>
        </Route>
        <Route element={<RequireAuth roles={["client"]} />}>
          <Route element={<PortalShell />}>
            <Route path="/portal/client" element={<ClientDashboard />} />
          </Route>
        </Route>
        <Route element={<RequireAuth roles={["admin"]} />}>
          <Route element={<PortalShell />}>
            <Route path="/portal/admin" element={<AdminDashboard />} />
            <Route path="/portal/admin/users" element={<AdminUsers />} />
          </Route>
        </Route>
        <Route path="/portal/*" element={<Navigate to="/portal" replace />} />
      </Routes>
    </AuthProvider>
  );
}
