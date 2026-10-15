import { useEffect, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { useWorkspace } from "../shared/store";
import { roles, type WorkspaceUser } from "../shared/access";
import { Badge, Button, ErrorNote, Field, Modal, Panel } from "../shared/ui";
export function UserManagement() {
  const { data, user, request, toast } = useWorkspace();
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<string>("Technician");
  const [events, setEvents] = useState<string[]>([]);
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
      <Panel title="Your access">
        <div className="panel-body">
          <Badge>{user?.role}</Badge>
          <p>
            Your account can access only permitted modules and assigned records.
            Ask the company owner to change access.
          </p>
        </div>
      </Panel>
    );
  return (
    <>
      <Panel
        title="Users & roles"
        subtitle="Permissions are checked by the server on every request."
        action={
          <Button
            onClick={() => {
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
              )}
            </div>
          ))}
        </div>
      </Panel>
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
                    role,
                    eventIds: events,
                    ...(role === "Client / Guest"
                      ? {
                          clientId: f.get("clientId"),
                          sharedProposalIds: f.getAll("sharedProposalIds"),
                        }
                      : {}),
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
            <Field label="Role">
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {roles.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </Field>
            {!["Administrator", "Sales Manager", "Client / Guest"].includes(
              role,
            ) && (
              <fieldset className="assignment-fieldset">
                <legend>Assigned events</legend>
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
                  <p>Create events before assigning this account.</p>
                )}
              </fieldset>
            )}
            {role === "Client / Guest" && (
              <>
                <Field label="Client profile">
                  <select required name="clientId">
                    <option value="">Choose client</option>
                    {data.clients.map((c) => (
                      <option value={c.id} key={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <fieldset className="assignment-fieldset">
                  <legend>Explicitly shared proposal revisions</legend>
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
                        />
                        {p.number} · v{p.version}
                      </label>
                    ))}
                </fieldset>
              </>
            )}
            <div className="modal-actions">
              <Button disabled={busy}>
                {busy ? "Creating…" : "Create user"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
