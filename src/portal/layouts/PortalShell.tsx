import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LogOut } from "lucide-react";
import { Wordmark } from "../../shared/ui/Wordmark";
import { Badge, roleTone } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { useAuth } from "../lib/auth";
import { leaveWorkspace } from "../lib/workspace";
import { es } from "../lib/es";
import { cn } from "../lib/utils";

export function PortalShell() {
  const { account, signOut } = useAuth();
  const navigate = useNavigate();
  const role = account?.role ?? "user";

  // The portal is only the account-management side of the workspace.
  const links: { to: string; label: string; external?: boolean }[] = [
    { to: "/portal/admin/users", label: es.nav.users },
    // A different app (full page load): the company workspace.
    { to: "/", label: es.nav.workspace, external: true },
  ];

  return (
    <div className="portal-root portal-scope">
      <header className="sticky top-0 z-40 border-b border-k-border bg-k-surface backdrop-blur">
        <div className="mx-auto flex max-w-300 flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Wordmark size={26} />
          <nav
            aria-label={es.nav.mainNav}
            className="flex flex-1 gap-1 overflow-x-auto"
          >
            {links.map((link) =>
              link.external ? (
                <a
                  key={link.to}
                  href={link.to}
                  className="rounded-k-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap text-k-muted no-underline hover:text-k-text"
                >
                  {link.label}
                </a>
              ) : (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={({ isActive }) =>
                    cn(
                      "rounded-k-sm px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                      isActive
                        ? "bg-k-primary-subtle text-k-primary"
                        : "text-k-muted hover:text-k-text",
                    )
                  }
                >
                  {link.label}
                </NavLink>
              ),
            )}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-k-muted sm:inline">
              {account?.profile.full_name ?? account?.profile.email}
            </span>
            <Badge tone={roleTone[role]}>{es.roles[role]}</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await leaveWorkspace();
                await signOut();
                toast.success("Cerraste sesión.");
                navigate("/portal/login");
              }}
            >
              <LogOut aria-hidden="true" />
              {es.nav.signOut}
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-300 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
