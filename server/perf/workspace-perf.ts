// Seeded performance check for the single-row workspace model.
// Usage: npm run perf [-- --scale=2]
// Builds a large, valid synthetic workspace in an in-memory database and times
// the operations every save, read and report depends on. Makes no network calls.
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { Repository, emptyWorkspace } from "../database";
import {
  applyChanges,
  scopeWorkspace,
  validateWorkspace,
} from "../permissions";
import { availableStock, inventoryConflicts } from "../../src/shared/domain";
import {
  automationCandidates,
  dataQualityReport,
  financialReport,
  pipelineReport,
  utilizationReport,
  workloadReport,
} from "../../src/shared/reporting";
import { diffWorkspace, type WorkspaceUser } from "../../src/shared/access";
import type { Workspace } from "../../src/shared/types";

export function syntheticWorkspace(scale = 1): Workspace {
  const n = (count: number) => Math.round(count * scale);
  const workspace = emptyWorkspace("Rendimiento");
  const day = (offset: number) =>
    new Date(Date.UTC(2027, 0, 1 + offset)).toISOString().slice(0, 10);
  for (let i = 0; i < n(3000); i++)
    workspace.clients.push({
      id: `c${i}`,
      name: `Cliente ${i}`,
      contact: `Contacto ${i}`,
      email: `cliente${i}@example.test`,
      phone: "",
      industry: "Corporate",
      initials: "CL",
      color: "sage",
      notes: "",
    });
  for (let i = 0; i < n(200); i++)
    workspace.venues.push({
      id: `v${i}`,
      name: `Lugar ${i}`,
      city: "San Juan",
      category: "Hotel",
      rooms: [],
      notes: "",
      color: "sage",
    });
  for (let i = 0; i < n(2000); i++)
    workspace.equipment.push({
      id: `q${i}`,
      name: `Equipo ${i}`,
      category: ["Audio", "Video", "Lighting", "Staging"][i % 4],
      sku: `SKU-${i}`,
      quantity: 200,
      maintenance: 0,
      rate: 10 + (i % 90),
      description: "",
    });
  for (let i = 0; i < n(3000); i++) {
    const start = i % 365;
    workspace.events.push({
      id: `e${i}`,
      name: `Evento ${i}`,
      clientId: `c${i % n(3000)}`,
      venueId: `v${i % n(200)}`,
      date: day(start),
      endDate: day(start + 1),
      status: "Planning",
      type: "Conference",
      manager: "Gerencia",
      budget: 10000,
      attendees: 150,
      notes: "",
      timezone: "America/Puerto_Rico",
    });
    workspace.proposals.push({
      id: `p${i}`,
      number: `P-${i}`,
      eventId: `e${i}`,
      version: 1,
      title: `Propuesta ${i}`,
      introduction: "",
      terms: "",
      lines: Array.from({ length: 5 }, (_, line) => ({
        id: `p${i}-l${line}`,
        equipmentId: `q${(i * 5 + line) % n(2000)}`,
        description: "Equipo",
        quantity: 2,
        rate: 50,
        days: 2,
      })),
      discount: 0,
      tax: 11.5,
      status: "Draft",
      validUntil: day(start),
    });
    for (let r = 0; r < 2; r++)
      workspace.reservations.push({
        id: `r${i}-${r}`,
        eventId: `e${i}`,
        equipmentId: `q${(i * 2 + r) % n(2000)}`,
        quantity: 2,
        start: day(start),
        end: day(start + 1),
        status: "Hold",
      });
    for (let t = 0; t < 2; t++)
      workspace.tasks.push({
        id: `t${i}-${t}`,
        eventId: `e${i}`,
        title: "Tarea",
        assignee: "Equipo",
        role: "Producción",
        date: day(start),
        done: false,
        phase: "Planning",
      });
  }
  return workspace;
}

function time<T>(label: string, fn: () => T, runs = 3) {
  let result!: T;
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const started = performance.now();
    result = fn();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return { label, medianMs: Math.round(samples[Math.floor(runs / 2)]), result };
}

export function runPerformanceCheck(scale = 1) {
  const workspace = syntheticWorkspace(scale);
  const repo = new Repository(":memory:");
  repo.db
    .prepare("INSERT INTO workspace VALUES (1,0,?)")
    .run(JSON.stringify(workspace));
  const admin: WorkspaceUser = {
    id: "u-admin",
    name: "Admin",
    email: "admin@example.test",
    role: "Administrator",
    isOwner: true,
    active: true,
    eventIds: [],
    sharedProposalIds: [],
  };
  const designer: WorkspaceUser = {
    ...admin,
    id: "u-designer",
    role: "Event Designer",
    isOwner: false,
    eventIds: workspace.events.slice(0, 50).map((e) => e.id),
  };
  const reservation = { ...workspace.reservations[0], quantity: 3 };
  const results = [
    time("Repository.read (parse payload)", () => repo.read()),
    time("JSON.stringify workspace", () => JSON.stringify(workspace)),
    time("validateWorkspace (full)", () =>
      validateWorkspace(workspace, workspace),
    ),
    time("applyChanges: one reservation", () =>
      applyChanges(
        workspace,
        [
          {
            collection: "reservations",
            id: reservation.id,
            value: reservation,
          },
        ],
        admin,
      ),
    ),
    time("Repository.save (one write)", () => {
      const current = repo.read();
      repo.save(current.workspace, current.revision);
    }),
    time("scopeWorkspace: Event Designer", () =>
      scopeWorkspace(workspace, designer),
    ),
    time("availability: all equipment, one window", () =>
      workspace.equipment.map((item) =>
        availableStock(
          item,
          workspace.reservations,
          "2027-03-01",
          "2027-03-05",
        ),
      ),
    ),
    time("inventoryConflicts", () => inventoryConflicts(workspace)),
    time("diffWorkspace: one change (client)", () =>
      diffWorkspace(workspace, {
        ...workspace,
        tasks: workspace.tasks.map((t, i) =>
          i === 0 ? { ...t, done: true } : t,
        ),
      }),
    ),
    time("reports: pipeline + financial + workload + quality", () => [
      pipelineReport(workspace),
      financialReport(workspace),
      workloadReport(workspace),
      dataQualityReport(workspace),
    ]),
    time("utilizationReport: 90 days", () =>
      utilizationReport(workspace, "2027-01-01", "2027-03-31"),
    ),
    time("automationCandidates", () =>
      automationCandidates(workspace, new Date("2027-01-15T12:00:00Z")),
    ),
  ];
  repo.close();
  return {
    scale,
    counts: {
      clients: workspace.clients.length,
      events: workspace.events.length,
      equipment: workspace.equipment.length,
      proposals: workspace.proposals.length,
      reservations: workspace.reservations.length,
      tasks: workspace.tasks.length,
    },
    payloadMB: +(JSON.stringify(workspace).length / 1_000_000).toFixed(2),
    timings: results.map(({ label, medianMs }) => ({ label, medianMs })),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const scale = Number(
    process.argv.find((arg) => arg.startsWith("--scale="))?.slice(8) || 1,
  );
  const report = runPerformanceCheck(scale);
  console.log(`Scale ${report.scale} · payload ${report.payloadMB} MB`);
  console.log(JSON.stringify(report.counts));
  console.table(report.timings);
}
