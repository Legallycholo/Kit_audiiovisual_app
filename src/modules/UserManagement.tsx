import { useEffect, useState } from "react";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { useWorkspace } from "../shared/store";
import { roles, type WorkspaceUser } from "../shared/access";
import { uiLabel } from "../shared/i18n";
import { Badge, Button, ErrorNote, Field, Modal, Panel } from "../shared/ui";

// Role, event and client-sharing fields shared by the create and edit forms.
function GrantFields({
  role,
  setRole,
  events,
  setEvents,
  defaults,
}: {
  role: string;
  setRole: (role: string) => void;
  events: string[];
  setEvents: (events: string[]) => void;
  defaults?: { clientId?: string; sharedProposalIds: string[] };
}) {
  const { data } = useWorkspace();
  return (
    <>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          {roles.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </Field>
      {!["Administrator", "Sales Manager", "Client / Guest"].includes(role) && (
        <fieldset className="assignment-fieldset">
          <legend>{uiLabel("Assigned events")}</legend>
          {data.events.map((event) => (
            <label key={event.id}>
              <input
                type="checkbox"
                checked={events.includes(event.id)}
                onChange={(e) =>
                  setEvents(
                    e.target.checked
                      ? [...events, event.id]
                      : events.filter((id) => id !== event.id),
                  )
                }
              />
              {event.name}
            </label>
          ))}
          {!data.events.length && (
            <p>{uiLabel("Create events before assigning this account.")}</p>
          )}
        </fieldset>
      )}
      {role === "Client / Guest" && (
        <>
          <Field label="Client profile">
            <select
              required
              name="clientId"
              defaultValue={defaults?.clientId || ""}
            >
              <option value="">{uiLabel("Choose client")}</option>
              {data.clients.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="assignment-fieldset">
            <legend>{uiLabel("Explicitly shared proposal revisions")}</legend>
            {data.proposals
              .filter((p) =>
                ["Issued", "Accepted", "Declined", "Superseded"].includes(
                  p.status,
                ),
              )
              .map((p) => (
                <label key={p.id}>
                  <input
                    name="sharedProposalIds"
                    type="checkbox"
                    value={p.id}
                    defaultChecked={defaults?.sharedProposalIds.includes(p.id)}
                  />
                  {p.number} · v{p.version}
                </label>
              ))}
          </fieldset>
        </>
      )}
    </>
  );
}

function grantBody(role: string, events: string[], form: FormData) {
  return {
    role,
    eventIds: events,
    ...(role === "Client / Guest"
      ? {
          clientId: form.get("clientId"),
          sharedProposalIds: form.getAll("sharedProposalIds"),
        }
      : {}),
  };
}

function PasswordPanel() {
  const { request, toast } = useWorkspace();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Panel
      title="Change password"
      subtitle="Your other signed-in devices are signed out after the change."
    >
      <form
        className="panel-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const form = e.currentTarget;
          const f = new FormData(form);
          if (f.get("newPassword") !== f.get("confirmPassword")) {
            setError(uiLabel("The new passwords do not match."));
            return;
          }
          setBusy(true);
          try {
            await request("/account/password", {
              method: "POST",
              body: {
                currentPassword: f.get("currentPassword"),
                newPassword: f.get("newPassword"),
              },
            });
            form.reset();
            toast(uiLabel("Password changed. Other devices were signed out."));
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field label="Current password">
          <input
            required
            name="currentPassword"
            type="password"
            maxLength={256}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" hint="Minimum 12 characters.">
          <input
            required
            name="newPassword"
            type="password"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Confirm new password">
          <input
            required
            name="confirmPassword"
            type="password"
            minLength={12}
            maxLength={256}
            autoComplete="new-password"
          />
        </Field>
        <div className="modal-actions">
          <Button disabled={busy}>
            {busy ? "Saving…" : "Change password"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

export function UserManagement() {
  const { user, request, toast } = useWorkspace();
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<string>("Technician");
  const [events, setEvents] = useState<string[]>([]);
  const [editing, setEditing] = useState<WorkspaceUser | null>(null);
  const [resetting, setResetting] = useState<WorkspaceUser | null>(null);
  const [temporary, setTemporary] = useState<{
    name: string;
    password: string;
  } | null>(null);
  async function reload() {
    try {
      const result = await request<{ users: WorkspaceUser[] }>("/users");
      setUsers(result.users);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    if (user?.role === "Administrator") void reload();
  }, [user?.role]);
  if (user?.role !== "Administrator")
    return (
      <>
        <Panel title="Your access">
          <div className="panel-body">
            <Badge>{user?.role}</Badge>
            <p>
              Your account can access only permitted modules and assigned
              records. Ask the company owner to change access.
            </p>
          </div>
        </Panel>
        <PasswordPanel />
      </>
    );
  return (
    <>
      <Panel
        title="Users & roles"
        subtitle="Permissions are checked by the server on every request."
        action={
          <Button
            onClick={() => {
              setRole("Technician");
              setEvents([]);
              setAdding(true);
              setError("");
            }}
          >
            <Plus size={15} />
            Add user
          </Button>
        }
      >
        <div className="panel-body">
          {error && <ErrorNote>{error}</ErrorNote>}
          {users.map((person) => (
            <div className="role-row" key={person.id}>
              <ShieldCheck size={21} />
              <div>
                <strong>
                  {person.name}
                  {person.isOwner ? " · Owner" : ""}
                </strong>
                <p>
                  {person.email} · {person.role}
                </p>
                <small>{person.eventIds.length} assigned events</small>
              </div>
              <Badge>{person.active ? "Active" : "Inactive"}</Badge>
              {!person.isOwner && person.id !== user.id && (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setError("");
                      setRole(person.role);
                      setEvents(person.eventIds);
                      setEditing(person);
                    }}
                  >
                    Edit access
                  </Button>
                  {person.active && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setError("");
                        setResetting(person);
                      }}
                    >
                      Reset password
                    </Button>
                  )}
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await request(`/users/${person.id}`, {
                          method: "PATCH",
                          body: { active: !person.active },
                        });
                        await reload();
                        toast(
                          person.active
                            ? "Account deactivated and sessions revoked."
                            : "Account reactivated.",
                        );
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    {person.active ? "Deactivate" : "Reactivate"}
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </Panel>
      <PasswordPanel />
      {adding && (
        <Modal
          title="Create a workspace account"
          description="No invitation message is sent. Share the initial credentials with the team member through your established secure channel."
          onClose={() => setAdding(false)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await request("/users", {
                  method: "POST",
                  body: {
                    name: f.get("name"),
                    email: f.get("email"),
                    password: f.get("password"),
                    ...grantBody(role, events, f),
                  },
                });
                await reload();
                setAdding(false);
                setEvents([]);
                toast("Account created. No invitation was sent.");
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <Field label="Full name">
              <input required name="name" autoComplete="off" />
            </Field>
            <Field label="Email">
              <input required name="email" type="email" autoComplete="off" />
            </Field>
            <Field label="Initial password" hint="Minimum 12 characters.">
              <input
                required
                name="password"
                type="password"
                minLength={12}
                maxLength={256}
                autoComplete="new-password"
              />
            </Field>
            <GrantFields
              role={role}
              setRole={setRole}
              events={events}
              setEvents={setEvents}
            />
            <div className="modal-actions">
              <Button disabled={busy}>
                {busy ? "Creating…" : "Create user"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {editing && (
        <Modal
          title="Edit account access"
          description="Saving signs this person out so their next session uses the new access."
          onClose={() => setEditing(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              setBusy(true);
              const f = new FormData(e.currentTarget);
              try {
                await request(`/users/${editing.id}/access`, {
                  method: "PUT",
                  body: grantBody(role, events, f),
                });
                await reload();
                setEditing(null);
                setEvents([]);
                toast(
                  uiLabel(
                    "Access updated. Their open sessions were signed out.",
                  ),
                );
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {error && <ErrorNote>{error}</ErrorNote>}
            <p>
              <strong>{editing.name}</strong> · {editing.email}
            </p>
            <GrantFields
              role={role}
              setRole={setRole}
              events={events}
              setEvents={setEvents}
              defaults={editing}
            />
            <div className="modal-actions">
              <Button disabled={busy}>
                {busy ? "Saving…" : "Save access"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {resetting && (
        <Modal
          title="Reset password"
          description="A temporary password is generated and shown once. This person's open sessions are signed out."
          onClose={() => setResetting(null)}
        >
          <div className="modal-body">
            {error && <ErrorNote>{error}</ErrorNote>}
            <p>
              <strong>{resetting.name}</strong> · {resetting.email}
            </p>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setResetting(null)}>
                Cancel
              </Button>
              <Button
                disabled={busy}
                onClick={async () => {
                  setError("");
                  setBusy(true);
                  try {
                    const result = await request<{
                      temporaryPassword: string;
                    }>(`/users/${resetting.id}/reset-password`, {
                      method: "POST",
                      body: {},
                    });
                    setTemporary({
                      name: resetting.name,
                      password: result.temporaryPassword,
                    });
                    setResetting(null);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <KeyRound size={15} />
                Generate temporary password
              </Button>
            </div>
          </div>
        </Modal>
      )}
      {temporary && (
        <Modal
          title="Temporary password"
          description="Share it through your established secure channel and ask them to change it after signing in. It is not shown again."
          onClose={() => setTemporary(null)}
        >
          <div className="modal-body">
            <p>{temporary.name}</p>
            <code
              className="temporary-password"
              aria-label={uiLabel("Temporary password")}
            >
              {temporary.password}
            </code>
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() =>
                  void navigator.clipboard
                    ?.writeText(temporary.password)
                    .then(() => toast(uiLabel("Copied.")))
                }
              >
                Copy
              </Button>
              <Button onClick={() => setTemporary(null)}>Done</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
