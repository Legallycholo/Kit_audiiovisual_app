import { useCallback, useEffect, useState } from "react";
import { Check, ShieldQuestion, UserCheck, UserX } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { roles, type Role } from "../../shared/access";
import { uiLabel } from "../../shared/i18n";
import { Badge, Button, Empty, ErrorNote, Panel } from "../../shared/ui";
import { shortDate } from "../../shared/domain";

type Registration = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  status: "pending" | "active" | "disabled";
  isOwner: boolean;
  createdAt?: string;
};

const tones: Record<Registration["status"], string> = {
  active: "green",
  pending: "amber",
  disabled: "neutral",
};
const labels: Record<Registration["status"], string> = {
  active: "Account active",
  pending: "Pending approval",
  disabled: "Account disabled",
};

/**
 * Administrator review of self-registered Supabase accounts. Signing up never
 * grants access: the role is chosen here, the server authorizes the change and
 * records it. The panel renders nothing where Supabase sign-in is not set up.
 */
export function AccessRequests() {
  const { request, user, toast } = useWorkspace();
  const [accounts, setAccounts] = useState<Registration[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [choice, setChoice] = useState<Record<string, Role>>({});
  const [busy, setBusy] = useState("");
  const admin = user?.role === "Administrator";

  const load = useCallback(async () => {
    try {
      const result = await request<{ accounts: Registration[] }>(
        "/supabase/accounts",
      );
      setAccounts(result.accounts);
      setUnavailable(false);
    } catch (failure) {
      // 404 means this deployment does not offer Supabase sign-in at all.
      if ((failure as { status?: number }).status === 404) setUnavailable(true);
      else setError((failure as Error).message);
      setAccounts([]);
    }
  }, [request]);

  useEffect(() => {
    if (admin) void load();
  }, [admin, load]);

  if (!admin || unavailable) return null;

  const decide = async (
    account: Registration,
    patch: { role?: Role | null; status?: "active" | "disabled" },
  ) => {
    setBusy(account.id);
    setError("");
    try {
      await request(`/supabase/accounts/${account.id}`, {
        method: "PATCH",
        body: patch,
      });
      toast(
        patch.status === "active"
          ? `${account.email} ya tiene acceso como ${patch.role}.`
          : `${account.email} ya no tiene acceso.`,
      );
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy("");
    }
  };

  const pending = (accounts || []).filter((a) => a.status === "pending");
  const decided = (accounts || []).filter((a) => a.status !== "pending");

  return (
    <>
      <Panel
        title="Access requests"
        subtitle="Accounts that registered and are waiting for a role."
        action={
          pending.length ? (
            <Badge tone="amber">{`${pending.length}`}</Badge>
          ) : undefined
        }
      >
        <div className="panel-body">
          {error && <ErrorNote>{error}</ErrorNote>}
          {accounts === null ? (
            <p>Cargando…</p>
          ) : !pending.length ? (
            <Empty
              compact
              icon={<ShieldQuestion size={24} />}
              title="No access requests"
              description="Las cuentas nuevas aparecen aquí para que les asignes un rol."
            />
          ) : (
            pending.map((account) => (
              <div className="role-row" key={account.id}>
                <ShieldQuestion size={21} />
                <div>
                  <strong>{account.name || account.email}</strong>
                  <p>
                    {account.email}
                    {account.createdAt
                      ? ` · ${uiLabel("Signed up")} ${shortDate(account.createdAt)}`
                      : ""}
                  </p>
                  <small>
                    {choice[account.id]
                      ? `${uiLabel("Role")}: ${choice[account.id]}`
                      : uiLabel("Choose a role to approve this request.")}
                  </small>
                </div>
                <Badge tone="amber">{labels.pending}</Badge>
                <select
                  aria-label={`${uiLabel("Role")} · ${account.email}`}
                  value={choice[account.id] || ""}
                  onChange={(event) =>
                    setChoice({
                      ...choice,
                      [account.id]: event.target.value as Role,
                    })
                  }
                >
                  <option value="">{uiLabel("Choose role")}</option>
                  {roles.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                <Button
                  disabled={busy === account.id || !choice[account.id]}
                  onClick={() =>
                    void decide(account, {
                      role: choice[account.id],
                      status: "active",
                    })
                  }
                >
                  <Check size={15} />
                  {uiLabel("Approve")}
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy === account.id}
                  onClick={() => void decide(account, { status: "disabled" })}
                >
                  <UserX size={15} />
                  {uiLabel("Reject")}
                </Button>
              </div>
            ))
          )}
        </div>
      </Panel>
      {decided.length > 0 && (
        <Panel
          title="Registered accounts"
          subtitle="Accounts created through sign-up, with the role they hold now."
        >
          <div className="panel-body">
            {decided.map((account) => (
              <div className="role-row" key={account.id}>
                <UserCheck size={21} />
                <div>
                  <strong>
                    {account.name || account.email}
                    {account.isOwner ? ` · ${uiLabel("Workspace owner")}` : ""}
                  </strong>
                  <p>
                    {account.email} · {account.role || uiLabel("No role")}
                  </p>
                </div>
                <Badge tone={tones[account.status]}>
                  {labels[account.status]}
                </Badge>
                {!account.isOwner &&
                  (account.status === "active" ? (
                    <Button
                      variant="secondary"
                      disabled={busy === account.id}
                      onClick={() =>
                        void decide(account, { status: "disabled" })
                      }
                    >
                      {uiLabel("Disable")}
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={busy === account.id || !account.role}
                      onClick={() =>
                        void decide(account, {
                          role: account.role as Role,
                          status: "active",
                        })
                      }
                    >
                      {uiLabel("Reactivate")}
                    </Button>
                  ))}
              </div>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}
