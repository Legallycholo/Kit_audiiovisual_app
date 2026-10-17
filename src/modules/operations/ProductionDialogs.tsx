import { Clock3 } from "lucide-react";
import { activity } from "../../shared/store";
import { Button, ErrorNote, Field, Modal } from "../../shared/ui";
import { crewShiftConflicts } from "../../shared/domain";
import type { ActualCost, Task } from "../../shared/types";
import { changeOperations } from "./helpers";
import type { ProductionView } from "./production-view";

export function ProductionDialogs({ ctx }: { ctx: ProductionView }) {
  const {
    data,
    update,
    toast,
    mode,
    draft,
    setDraft,
    members,
    teamError,
    operationError,
    setOperationError,
    shiftDraft,
    setShiftDraft,
    cueDraft,
    setCueDraft,
    transportDraft,
    setTransportDraft,
    changeDraft,
    setChangeDraft,
    costDraft,
    setCostDraft,
  } = ctx;
  return (
    <>
      {shiftDraft && (
        <Modal
          title="Crew shift"
          onClose={() => {
            setShiftDraft(null);
            setOperationError("");
          }}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const normalized = {
                ...shiftDraft,
                start: new Date(shiftDraft.start).toISOString(),
                end: new Date(shiftDraft.end).toISOString(),
              };
              const { eventId, ...shift } = normalized;
              const conflicts = crewShiftConflicts(
                data.operations,
                shift,
                eventId,
              );
              if (conflicts.length) {
                const conflictEvent = data.events.find(
                  (item) => item.id === conflicts[0].eventId,
                );
                setOperationError(
                  `${shift.person} already has an overlapping shift for ${conflictEvent?.name || "another event"}.`,
                );
                return;
              }
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({
                      ...record,
                      crewShifts: [...record.crewShifts, shift],
                    }),
                  ),
                  activity: [
                    activity(
                      "Crew shift scheduled",
                      `${shift.person} · ${shift.role}`,
                      eventId,
                    ),
                    ...workspace.activity,
                  ],
                }))
              ) {
                setShiftDraft(null);
                setOperationError("");
                toast("Crew shift scheduled.");
              }
            }}
          >
            {operationError && <ErrorNote>{operationError}</ErrorNote>}
            <Field label="Event">
              <select
                value={shiftDraft.eventId}
                onChange={(event) =>
                  setShiftDraft({ ...shiftDraft, eventId: event.target.value })
                }
              >
                {data.events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Crew member">
                <input
                  required
                  value={shiftDraft.person}
                  onChange={(event) =>
                    setShiftDraft({
                      ...shiftDraft,
                      person: event.target.value,
                      memberId: undefined,
                    })
                  }
                />
              </Field>
              <Field label="Role">
                <input
                  required
                  value={shiftDraft.role}
                  onChange={(event) =>
                    setShiftDraft({ ...shiftDraft, role: event.target.value })
                  }
                />
              </Field>
              <Field label="Starts">
                <input
                  required
                  type="datetime-local"
                  value={shiftDraft.start.slice(0, 16)}
                  onChange={(event) =>
                    setShiftDraft({ ...shiftDraft, start: event.target.value })
                  }
                />
              </Field>
              <Field label="Ends">
                <input
                  required
                  type="datetime-local"
                  value={shiftDraft.end.slice(0, 16)}
                  onChange={(event) =>
                    setShiftDraft({ ...shiftDraft, end: event.target.value })
                  }
                />
              </Field>
              <Field label="Actual crew cost">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={shiftDraft.cost}
                  onChange={(event) =>
                    setShiftDraft({
                      ...shiftDraft,
                      cost: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <div className="modal-actions">
              <Button>
                <Clock3 size={16} /> Schedule shift
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {cueDraft && (
        <Modal title="Run-of-show cue" onClose={() => setCueDraft(null)}>
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...cue } = {
                ...cueDraft,
                at: new Date(cueDraft.at).toISOString(),
              };
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({ ...record, cues: [...record.cues, cue] }),
                  ),
                }))
              ) {
                setCueDraft(null);
                toast("Run-of-show cue added.");
              }
            }}
          >
            <Field label="Event">
              <select
                value={cueDraft.eventId}
                onChange={(event) =>
                  setCueDraft({ ...cueDraft, eventId: event.target.value })
                }
              >
                {data.events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Cue">
              <input
                required
                value={cueDraft.title}
                onChange={(event) =>
                  setCueDraft({ ...cueDraft, title: event.target.value })
                }
              />
            </Field>
            <div className="form-grid">
              <Field label="Time">
                <input
                  required
                  type="datetime-local"
                  value={cueDraft.at.slice(0, 16)}
                  onChange={(event) =>
                    setCueDraft({ ...cueDraft, at: event.target.value })
                  }
                />
              </Field>
              <Field label="Department">
                <input
                  required
                  value={cueDraft.department}
                  onChange={(event) =>
                    setCueDraft({ ...cueDraft, department: event.target.value })
                  }
                />
              </Field>
              <Field label="Owner">
                <input
                  required
                  value={cueDraft.owner}
                  onChange={(event) =>
                    setCueDraft({ ...cueDraft, owner: event.target.value })
                  }
                />
              </Field>
            </div>
            <Field label="Execution note">
              <textarea
                value={cueDraft.notes}
                onChange={(event) =>
                  setCueDraft({ ...cueDraft, notes: event.target.value })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Add cue</Button>
            </div>
          </form>
        </Modal>
      )}
      {transportDraft && (
        <Modal
          title="Transport assignment"
          onClose={() => setTransportDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...transport } = {
                ...transportDraft,
                departureAt: new Date(transportDraft.departureAt).toISOString(),
                arrivalAt: new Date(transportDraft.arrivalAt).toISOString(),
              };
              if (transport.arrivalAt <= transport.departureAt) {
                setOperationError("Arrival must be after departure.");
                return;
              }
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({
                      ...record,
                      transports: [...record.transports, transport],
                    }),
                  ),
                }))
              ) {
                setTransportDraft(null);
                setOperationError("");
                toast("Transport assignment added.");
              }
            }}
          >
            {operationError && <ErrorNote>{operationError}</ErrorNote>}
            <Field label="Event">
              <select
                value={transportDraft.eventId}
                onChange={(event) =>
                  setTransportDraft({
                    ...transportDraft,
                    eventId: event.target.value,
                  })
                }
              >
                {data.events.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Direction">
                <select
                  value={transportDraft.kind}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      kind: event.target.value as "Outbound" | "Return",
                    })
                  }
                >
                  <option>Outbound</option>
                  <option>Return</option>
                </select>
              </Field>
              <Field label="Provider">
                <input
                  required
                  value={transportDraft.provider}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      provider: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Vehicle">
                <input
                  required
                  value={transportDraft.vehicle}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      vehicle: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Driver">
                <input
                  required
                  value={transportDraft.driver}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      driver: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Departure">
                <input
                  required
                  type="datetime-local"
                  value={transportDraft.departureAt.slice(0, 16)}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      departureAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Arrival">
                <input
                  required
                  type="datetime-local"
                  value={transportDraft.arrivalAt.slice(0, 16)}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      arrivalAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Actual cost">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  value={transportDraft.cost}
                  onChange={(event) =>
                    setTransportDraft({
                      ...transportDraft,
                      cost: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                value={transportDraft.notes}
                onChange={(event) =>
                  setTransportDraft({
                    ...transportDraft,
                    notes: event.target.value,
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Add transport</Button>
            </div>
          </form>
        </Modal>
      )}
      {changeDraft && (
        <Modal
          title="Record onsite change"
          description="Saved entries are immutable production history."
          onClose={() => setChangeDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...change } = changeDraft;
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({
                      ...record,
                      changes: [...record.changes, change],
                    }),
                  ),
                  activity: [
                    activity("Onsite change recorded", change.title, eventId),
                    ...workspace.activity,
                  ],
                }))
              ) {
                setChangeDraft(null);
                toast("Onsite change preserved in the event log.");
              }
            }}
          >
            <Field label="Change title">
              <input
                required
                value={changeDraft.title}
                onChange={(event) =>
                  setChangeDraft({ ...changeDraft, title: event.target.value })
                }
              />
            </Field>
            <Field label="What changed">
              <textarea
                required
                value={changeDraft.detail}
                onChange={(event) =>
                  setChangeDraft({ ...changeDraft, detail: event.target.value })
                }
              />
            </Field>
            <Field label="Operational impact">
              <textarea
                required
                value={changeDraft.impact}
                onChange={(event) =>
                  setChangeDraft({ ...changeDraft, impact: event.target.value })
                }
              />
            </Field>
            <Field label="Estimated cost impact">
              <input
                type="number"
                min="0"
                step=".01"
                value={changeDraft.costImpact}
                onChange={(event) =>
                  setChangeDraft({
                    ...changeDraft,
                    costImpact: Number(event.target.value),
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Record change</Button>
            </div>
          </form>
        </Modal>
      )}
      {costDraft && (
        <Modal
          title="Record actual cost"
          description="Saved cost entries are immutable."
          onClose={() => setCostDraft(null)}
        >
          <form
            className="modal-body"
            onSubmit={async (event) => {
              event.preventDefault();
              const { eventId, ...cost } = costDraft;
              if (
                await update((workspace) => ({
                  ...workspace,
                  operations: changeOperations(
                    workspace,
                    eventId,
                    (record) => ({ ...record, costs: [...record.costs, cost] }),
                  ),
                }))
              ) {
                setCostDraft(null);
                toast("Actual cost recorded.");
              }
            }}
          >
            <div className="form-grid">
              <Field label="Category">
                <select
                  value={costDraft.category}
                  onChange={(event) =>
                    setCostDraft({
                      ...costDraft,
                      category: event.target.value as ActualCost["category"],
                    })
                  }
                >
                  {[
                    "Crew",
                    "Transport",
                    "Supplier rental",
                    "Repair",
                    "Other",
                  ].map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </Field>
              <Field label="Incurred date">
                <input
                  type="date"
                  required
                  value={costDraft.incurredAt}
                  onChange={(event) =>
                    setCostDraft({
                      ...costDraft,
                      incurredAt: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step=".01"
                  required
                  value={costDraft.amount}
                  onChange={(event) =>
                    setCostDraft({
                      ...costDraft,
                      amount: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Description">
              <input
                required
                value={costDraft.description}
                onChange={(event) =>
                  setCostDraft({
                    ...costDraft,
                    description: event.target.value,
                  })
                }
              />
            </Field>
            <div className="modal-actions">
              <Button>Record cost</Button>
            </div>
          </form>
        </Modal>
      )}
      {draft && (
        <Modal title="Add a production task" onClose={() => setDraft(null)}>
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                !(await update((s) => ({
                  ...s,
                  tasks: [...s.tasks, draft],
                  activity: [
                    activity(
                      "Production task added",
                      draft.title,
                      draft.eventId,
                    ),
                    ...s.activity,
                  ],
                })))
              )
                return;
              setDraft(null);
              toast("Task assigned.");
            }}
          >
            <Field label="Task">
              <input
                required
                autoFocus
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </Field>
            <Field label="Event">
              <select
                required
                value={draft.eventId}
                onChange={(e) =>
                  setDraft({ ...draft, eventId: e.target.value })
                }
              >
                {data.events.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label="Assignee">
                {mode === "company" ? (
                  <select
                    required
                    value={draft.assigneeId || ""}
                    onChange={(e) => {
                      const member = members.find(
                        (person) => person.id === e.target.value,
                      );
                      if (member)
                        setDraft({
                          ...draft,
                          assigneeId: member.id,
                          assignee: member.name,
                          role: member.role,
                        });
                    }}
                  >
                    <option value="">
                      Selecciona una cuenta asignada al evento
                    </option>
                    {members.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.name} · {person.role}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    required
                    value={draft.assignee}
                    onChange={(e) =>
                      setDraft({ ...draft, assignee: e.target.value })
                    }
                  />
                )}
                {teamError && <span role="alert">{teamError}</span>}
              </Field>
              <Field label="Due date">
                <input
                  required
                  type="date"
                  value={draft.date}
                  onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                />
              </Field>
              <Field label="Phase">
                <select
                  value={draft.phase}
                  onChange={(e) =>
                    setDraft({ ...draft, phase: e.target.value })
                  }
                >
                  <option>Planning</option>
                  <option>Preparation</option>
                </select>
              </Field>
            </div>
            <div className="modal-actions">
              <Button>Add task</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
