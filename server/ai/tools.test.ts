import { describe, expect, it } from "vitest";
import { createSeed } from "../../src/shared/seed";
import { availableStock } from "../../src/shared/domain";
import type { WorkspaceUser } from "../../src/shared/access";
import { HttpError } from "../database";
import { applyChanges, scopeWorkspace } from "../permissions";
import { defaultToolRegistry } from "./tools/index";
import {
  requiresConfirmation,
  toolId,
  toolName,
  type ToolContext,
} from "./tools";

const owner: WorkspaceUser = {
  id: "owner",
  name: "Owner",
  email: "owner@example.test",
  role: "Administrator",
  isOwner: true,
  active: true,
  eventIds: [],
  sharedProposalIds: [],
};
const technician: WorkspaceUser = {
  ...owner,
  id: "tech",
  name: "Tech",
  role: "Technician",
  isOwner: false,
  eventIds: ["e1"],
};
const registry = defaultToolRegistry();
const NOW = "2026-11-12T10:00:00.000Z";
function context(
  user = owner,
  services: Partial<ToolContext["services"]> = {},
): ToolContext {
  return {
    user,
    workspace: createSeed(),
    revision: 0,
    services: { now: () => NOW, ...services },
  };
}
async function run(id: string, input: unknown, ctx = context()) {
  const tool = registry.get(id)!;
  return tool.run(tool.input.parse(input), ctx);
}
const value = (outcome: { changes?: { value: unknown }[] }) =>
  outcome.changes![0].value as ReturnType<
    typeof createSeed
  >["proposals"][number];

describe("tool policy", () => {
  it("reads never ask, drafts ask unless auto, money and external effects always ask", () => {
    expect(requiresConfirmation("read", "ask")).toBe(false);
    expect(requiresConfirmation("read", "auto")).toBe(false);
    expect(requiresConfirmation("draft", "ask")).toBe(true);
    expect(requiresConfirmation("draft", "auto")).toBe(false);
    expect(requiresConfirmation("financial", "auto")).toBe(true);
    expect(requiresConfirmation("external", "auto")).toBe(true);
  });
  it("offers reads only in Ask mode, hides proposal tools from technicians and names tools for providers", () => {
    expect(
      registry.available(owner, "ask").every((t) => t.effect === "read"),
    ).toBe(true);
    const act = registry.available(owner, "act").map((t) => t.id);
    expect(act).toContain("proposal.update_section");
    expect(act).toContain("task.create");
    expect(
      registry.available(technician, "act").map((t) => t.id),
    ).not.toContain("proposal.get");
    expect(registry.available(technician, "act").map((t) => t.id)).toContain(
      "task.update",
    );
    const spec = registry
      .specs(owner, "act")
      .find((s) => s.name === "proposal__add_catalog_item")!;
    expect(toolId(spec.name)).toBe("proposal.add_catalog_item");
    expect(toolName("proposal.add_catalog_item")).toBe(spec.name);
    expect(spec.input_schema).toMatchObject({ additionalProperties: false });
    expect(Object.keys((spec.input_schema as any).properties)).not.toContain(
      "rate",
    );
    // Stable order between requests keeps the provider's prompt cache valid.
    expect(registry.specs(owner, "act")).toEqual(registry.specs(owner, "act"));
  });
});

describe("proposal tools", () => {
  it("replaces one section and leaves the rest of the draft untouched", async () => {
    const seed = createSeed();
    const before = seed.proposals.find((p) => p.id === "p2")!;
    const outcome = await run("proposal.update_section", {
      proposalId: "p2",
      section: "introduction",
      text: "Introducción nueva.",
    });
    const next = value(outcome);
    expect(next.introduction).toBe("Introducción nueva.");
    expect(next.title).toBe(before.title);
    expect(next.lines).toEqual(before.lines);
    expect(next.terms).toBe(before.terms);
    expect(next.status).toBe("Draft");
    expect(outcome.eventId).toBe("e2");
    expect(() => applyChanges(seed, outcome.changes!, owner)).not.toThrow();
  });
  it("adds catalog items at the catalog rate and rejects unknown ids, duplicates and injected prices", async () => {
    const tool = registry.get("proposal.add_catalog_item")!;
    expect(() =>
      tool.input.parse({
        proposalId: "p2",
        equipmentId: "q2",
        quantity: 1,
        days: 1,
        rate: 1,
      }),
    ).toThrow();
    const outcome = await run("proposal.add_catalog_item", {
      proposalId: "p2",
      equipmentId: "q2",
      quantity: 3,
    });
    const line = value(outcome).lines.at(-1)!;
    expect(line).toMatchObject({
      equipmentId: "q2",
      quantity: 3,
      days: 1,
      rate: 45,
    });
    expect((outcome.output as any).lineId).toBe(line.id);
    await expect(
      run("proposal.add_catalog_item", {
        proposalId: "p2",
        equipmentId: "missing",
      }),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      run("proposal.add_catalog_item", { proposalId: "p2", equipmentId: "q1" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("keeps money changes financial and refuses to touch issued revisions", async () => {
    expect(registry.get("proposal.set_discount")!.effect).toBe("financial");
    expect(registry.get("proposal.set_tax")!.effect).toBe("financial");
    expect(registry.get("proposal.set_custom_rate")!.effect).toBe("financial");
    expect(registry.get("proposal.set_payment_terms")!.effect).toBe(
      "financial",
    );
    const locked = createSeed().proposals.find((p) => p.id === "p1")!;
    expect(locked.status).toBe("Issued");
    await expect(
      run("proposal.set_discount", { proposalId: "p1", discount: 10 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      run("proposal.update_section", {
        proposalId: "p1",
        section: "title",
        text: "X",
      }),
    ).rejects.toMatchObject({ status: 409 });
    // The shared write policy is the last line of defence even for a forged change.
    expect(() =>
      applyChanges(
        createSeed(),
        [
          {
            collection: "proposals",
            id: "p1",
            value: { ...locked, title: "X" },
          },
        ],
        owner,
      ),
    ).toThrow(HttpError);
    const custom = await run("proposal.set_custom_rate", {
      proposalId: "p2",
      lineId: "l7",
      rate: 400,
    });
    expect(value(custom).lines.find((l) => l.id === "l7")!.rate).toBe(400);
    await expect(
      run("proposal.set_custom_rate", {
        proposalId: "p2",
        lineId: "l5",
        rate: 1,
      }),
    ).rejects.toMatchObject({ status: 422 });
  });
  it("creates an empty KIT Classic draft with the next number", async () => {
    const outcome = await run("proposal.create_draft", { eventId: "e1" });
    const p = value(outcome);
    expect(p).toMatchObject({
      number: "KIT-2026-003",
      version: 1,
      status: "Draft",
      eventId: "e1",
      title: "Oceanfront Partner Summit",
      presentationTemplate: "Classic",
      documentType: "PROPUESTA",
      lines: [],
    });
    expect(() =>
      applyChanges(createSeed(), outcome.changes!, owner),
    ).not.toThrow();
    await expect(
      run("proposal.create_draft", { eventId: "nope" }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("drafts with a brief through the proposal generator: catalog rates, no discount, invented equipment rejected", async () => {
    const generate = async () => ({
      title: "Conferencia",
      introduction: "Propuesta preliminar.",
      items: [{ equipmentId: "q1", quantity: 2, days: 1 }],
      customItems: [{ description: "Técnico de sonido", quantity: 1, days: 1 }],
      discount: 15,
      assumptions: ["Un día."],
      questions: ["¿Fecha confirmada?"],
    });
    const ctx = context(owner, { proposal: { model: "fixture", generate } });
    const outcome = await run(
      "proposal.create_draft",
      {
        eventId: "e1",
        brief: "Dos altavoces y un técnico para la conferencia.",
      },
      ctx,
    );
    const p = value(outcome);
    expect(p.lines[0]).toMatchObject({
      equipmentId: "q1",
      rate: 85,
      quantity: 2,
    });
    expect(p.lines[1]).toMatchObject({
      description: "Técnico de sonido",
      rate: 0,
    });
    expect(p.discount).toBe(0);
    expect(p.aiReview!.questions.join(" ")).toMatch(/descuento del 15 %/);
    expect(p.aiReview!.questions.join(" ")).toMatch(
      /precio de «Técnico de sonido»/,
    );
    const invented = context(owner, {
      proposal: {
        model: "fixture",
        generate: async () => ({
          ...(await generate()),
          items: [{ equipmentId: "ghost", quantity: 1, days: 1 }],
        }),
      },
    });
    await expect(
      run(
        "proposal.create_draft",
        { eventId: "e1", brief: "Lo que sea con equipos inventados." },
        invented,
      ),
    ).rejects.toMatchObject({ status: 502 });
    await expect(
      run("proposal.generate_content", {
        proposalId: "p2",
        brief: "Reescribe la introducción.",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });
  it("validates what is missing before sending", async () => {
    const out = (await run("proposal.validate", { proposalId: "p2" }))
      .output as { issues: string[] };
    expect(out.issues).toContain("No se indicaron condiciones de pago.");
  });
});

describe("record tools", () => {
  it("checks availability with the shared stock calculation", async () => {
    const seed = createSeed();
    const q1 = seed.equipment.find((q) => q.id === "q1")!;
    const start = seed.events[0].date;
    const end = seed.events[0].endDate;
    const out = (
      await run("inventory.check_availability", {
        equipmentId: "q1",
        start,
        end,
        quantity: 1,
      })
    ).output as any;
    expect(out.available).toBe(
      availableStock(q1, seed.reservations, start, end),
    );
    expect(out.enough).toBe(out.available >= 1);
  });
  it("creates tasks for the actor and updates them without changing identity", async () => {
    const created = await run("task.create", {
      eventId: "e1",
      title: "Probar sonido",
    });
    const task = created.changes![0].value as any;
    expect(task).toMatchObject({
      eventId: "e1",
      assigneeId: "owner",
      assignee: "Owner",
      done: false,
      phase: "Planning",
    });
    expect(() =>
      applyChanges(createSeed(), created.changes!, owner),
    ).not.toThrow();
    const updated = await run("task.update", { taskId: "t1", done: true });
    expect(updated.changes![0].value).toMatchObject({
      id: "t1",
      eventId: "e1",
      done: true,
    });
    expect(
      registry.get("task.update")!.input.safeParse({ taskId: "t1" }).success,
    ).toBe(false);
  });
});

describe("directory tools", () => {
  it("creates clients with the shared initials and refuses duplicates", async () => {
    const outcome = await run("client.create", {
      name: "Teatro Nuevo",
      contact: "Ana Ruiz",
      email: "ana@example.com",
    });
    const client = outcome.changes![0].value as any;
    expect(client).toMatchObject({
      name: "Teatro Nuevo",
      initials: "TN",
      color: "sage",
      industry: "Corporate",
      phone: "",
    });
    expect(() =>
      applyChanges(createSeed(), outcome.changes!, owner),
    ).not.toThrow();
    await expect(
      run("client.create", { name: "Museo de Arte", contact: "X" }),
    ).rejects.toMatchObject({ status: 409 });
    const updated = await run("client.update", {
      clientId: "c4",
      phone: "+1 787 555 0199",
    });
    expect(updated.changes![0].value).toMatchObject({
      id: "c4",
      phone: "+1 787 555 0199",
      initials: "MA",
    });
    expect(registry.get("client.create")!.roles).not.toContain("Technician");
  });
  it("creates events for an existing client with the company's time zone and keeps budget financial", async () => {
    const outcome = await run("event.create", {
      name: "Gala",
      clientId: "c1",
      type: "Gala",
      date: "2026-12-20",
    });
    const event = outcome.changes![0].value as any;
    expect(event).toMatchObject({
      clientId: "c1",
      endDate: "2026-12-20",
      status: "Planning",
      manager: "Owner",
      budget: 0,
      timezone: "America/Puerto_Rico",
    });
    expect(() =>
      applyChanges(createSeed(), outcome.changes!, owner),
    ).not.toThrow();
    await expect(
      run("event.create", {
        name: "X",
        clientId: "ghost",
        type: "Gala",
        date: "2026-12-20",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(registry.get("event.set_budget")!.effect).toBe("financial");
    const moved = await run("event.update", {
      eventId: "e1",
      date: "2027-01-10",
    });
    expect(moved.changes![0].value).toMatchObject({
      id: "e1",
      date: "2027-01-10",
      endDate: "2027-01-10",
    });
    // A production manager sees the scoped event (budget hidden) and may only move the status.
    const pm = {
      ...owner,
      id: "pm",
      role: "Production Manager" as const,
      isOwner: false,
      eventIds: ["e1"],
    };
    const renamed = await run(
      "event.update",
      { eventId: "e1", name: "Otro" },
      { ...context(pm), workspace: scopeWorkspace(createSeed(), pm) },
    );
    expect(() => applyChanges(createSeed(), renamed.changes!, pm)).toThrow(
      HttpError,
    );
    const scoped = {
      ...context(pm),
      workspace: scopeWorkspace(createSeed(), pm),
    };
    const status = await run(
      "event.update",
      { eventId: "e1", status: "Planning" },
      scoped,
    );
    const next = applyChanges(createSeed(), status.changes!, pm);
    // The hidden budget is restored from the stored record, not zeroed.
    expect(next.events.find((e) => e.id === "e1")).toMatchObject({
      status: "Planning",
      budget: 18000,
    });
    // Business readiness rules bind KIT too: no Preparation without an accepted proposal.
    const early = await run(
      "event.update",
      { eventId: "e1", status: "Preparation" },
      scoped,
    );
    expect(() => applyChanges(createSeed(), early.changes!, pm)).toThrow(
      /Production readiness/,
    );
  });
});
