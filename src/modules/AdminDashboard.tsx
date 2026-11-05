import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  History,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";
import { useWorkspace } from "../shared/store";
import { canSeeModule, roles, type WorkspaceUser } from "../shared/access";
import { uiLabel } from "../shared/i18n";
import {
  Badge,
  Empty,
  ErrorNote,
  PageHeader,
  Panel,
  Stat,
  TextLink,
} from "../shared/ui";

/** Sign-in and access events, separated from ordinary record activity. */
const ACCESS_EVENTS =
  /signed in|signed up|approved|deactivated|reactivated|role|access|session|password/i;

/**
 * Administrator overview of who can reach the workspace and with what role.
 * Administrator-only: canSeeModule() denies `/admin` to every other role.
 */
export function AdminDashboard() {
  const { data, request, user } = useWorkspace();
  const [team, setTeam] = useState<WorkspaceUser[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const result = await request<{ users: WorkspaceUser[] }>("/users");
        setTeam(result.users);
      } catch (failure) {
        setError((failure as Error).message);
        setTeam([]);
      }
    })();
  }, [request]);

  const accounts = team || [];
  const activeAccounts = accounts.filter((a) => a.active);
  const byRole = roles
    .map((role) => ({
      role,
      people: activeAccounts.filter((a) => a.role === role),
    }))
    .filter((group) => group.people.length > 0);
  const accessLog = data.activity
    .filter((entry) => ACCESS_EVENTS.test(`${entry.title} ${entry.detail}`))
    .slice(0, 12);

  return (
    <>
      <PageHeader
        eyebrow={uiLabel("Access and roles")}
        title="Administración"
        actions={
          <Link className="button primary" to="/settings/users">
            <UserCog size={17} />
            {uiLabel("Manage users")}
          </Link>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      <div className="stat-grid">
        <Stat
          label="Accounts with access"
          value={
            team === null
              ? "—"
              : activeAccounts.length.toString().padStart(2, "0")
          }
          detail={
            accounts.length > activeAccounts.length ? (
              <>
                {accounts.length - activeAccounts.length}{" "}
                {uiLabel("deactivated")}
              </>
            ) : undefined
          }
          icon={<Users size={18} />}
        />
        <Stat
          label="Roles in use"
          value={byRole.length.toString().padStart(2, "0")}
          detail={
            <>
              {roles.length} {uiLabel("roles defined")}
            </>
          }
          icon={<ShieldCheck size={18} />}
        />
        <Stat
          label="Recent access events"
          value={accessLog.length.toString().padStart(2, "0")}
          icon={<History size={18} />}
        />
      </div>
      <Panel
        title="Who holds each role"
        subtitle="Active accounts grouped by the role they sign in with."
      >
        <div className="panel-body">
          {team === null ? (
            <p>Cargando…</p>
          ) : !byRole.length ? (
            <Empty
              compact
              icon={<Users size={24} />}
              title="No accounts yet"
              description="Las cuentas aprobadas aparecen aquí con su rol."
            />
          ) : (
            byRole.map(({ role, people }) => (
              <div className="role-row" key={role}>
                <ShieldCheck size={21} />
                <div>
                  <strong>{role}</strong>
                  <p>
                    {people
                      .map((person) => person.name || person.email)
                      .join(", ")}
                  </p>
                  <small>
                    {role === "Administrator"
                      ? uiLabel("Full access to every section")
                      : `${uiLabel("Sections")}: ${sectionsFor(role)}`}
                  </small>
                </div>
                <Badge tone="blue">{people.length}</Badge>
                {person(people, user) && (
                  <Badge tone="green">{uiLabel("You")}</Badge>
                )}
              </div>
            ))
          )}
        </div>
      </Panel>
      <Panel
        title="Access history"
        subtitle="Sign-ins, approvals and role changes recorded by the server."
      >
        <div className="panel-body">
          {!accessLog.length ? (
            <Empty
              compact
              icon={<History size={24} />}
              title="No access events yet"
              description="Los inicios de sesión y los cambios de rol se registran aquí."
            />
          ) : (
            accessLog.map((entry) => (
              <div className="role-row" key={entry.id}>
                <History size={21} />
                <div>
                  <strong>{entry.title}</strong>
                  <p>{entry.detail}</p>
                </div>
                <small>
                  {new Date(entry.at).toLocaleString("es-PR", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
            ))
          )}
          <p>
            {uiLabel("The full audit trail is in Settings › Data.")}{" "}
            <TextLink to="/settings/data">{uiLabel("Open it")}</TextLink>
          </p>
        </div>
      </Panel>
    </>
  );
}

const person = (people: WorkspaceUser[], user: WorkspaceUser | null) =>
  Boolean(user && people.some((candidate) => candidate.id === user.id));

/** The module paths a role can reach, named for the overview. */
function sectionsFor(role: string) {
  const sample: WorkspaceUser = {
    id: "preview",
    name: "",
    email: "",
    role: role as WorkspaceUser["role"],
    isOwner: false,
    active: true,
    eventIds: [],
    sharedProposalIds: [],
  };
  const named: Record<string, string> = {
    "/": "Inicio",
    "/events": "Eventos",
    "/proposals": "Propuestas",
    "/clients": "Clientes",
    "/venues": "Lugares",
    "/design": "Diseño",
    "/creative": "Creativo",
    "/inventory": "Equipos",
    "/production": "Producción",
    "/inbox": "Mensajes",
    "/reports": "Informes",
  };
  const reachable = Object.entries(named)
    .filter(([path]) => canSeeModule(sample, path))
    .map(([, label]) => label);
  return reachable.length ? reachable.join(", ") : "—";
}
