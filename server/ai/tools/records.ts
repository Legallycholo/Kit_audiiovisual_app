import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Task } from "../../../src/shared/types";
import { availableStock, quoteTotals } from "../../../src/shared/domain";
import { HttpError } from "../../database";
import { defineTool, type ToolContext } from "../tools";

/**
 * Reads over events, clients, tasks and inventory, plus task writes. Every
 * handler sees the actor's scoped workspace, so a record outside their scope
 * simply does not exist here.
 */
const staff = [
  "Administrator",
  "Sales Manager",
  "Event Designer",
  "Production Manager",
  "Technician",
] as const;
const id = z.string().min(1).max(100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const query = z.string().trim().min(1).max(200);
const matches = (needle: string, ...fields: string[]) =>
  fields.some((f) =>
    f.toLocaleLowerCase().includes(needle.toLocaleLowerCase()),
  );

function eventOf(ctx: ToolContext, eventId: string) {
  const event = ctx.workspace.events.find((e) => e.id === eventId);
  if (!event)
    throw new HttpError(404, "No se encontró el evento o no tienes acceso.");
  return event;
}
function eventSummary(
  ctx: ToolContext,
  e: ToolContext["workspace"]["events"][number],
) {
  return {
    eventId: e.id,
    name: e.name,
    status: e.status,
    type: e.type,
    date: e.date,
    endDate: e.endDate,
    attendees: e.attendees,
    client:
      ctx.workspace.clients.find((c) => c.id === e.clientId)?.name ?? null,
    venue: ctx.workspace.venues.find((v) => v.id === e.venueId)?.name ?? null,
  };
}
const taskView = (t: Task) => ({
  taskId: t.id,
  eventId: t.eventId,
  title: t.title,
  assignee: t.assignee,
  date: t.date,
  done: t.done,
  phase: t.phase,
});

export const recordTools = [
  defineTool({
    id: "event.list",
    description:
      "Lista los eventos visibles, ordenados por fecha. Filtro opcional por estado.",
    input: z
      .object({
        status: z
          .enum([
            "Planning",
            "Confirmed",
            "Preparation",
            "In production",
            "Completed",
            "Cancelled",
          ])
          .optional(),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .strict(),
    roles: staff,
    effect: "read",
    describe: () => "Listar eventos",
    run: async ({ status, limit }, ctx) => {
      const events = ctx.workspace.events
        .filter((e) => !status || e.status === status)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, limit)
        .map((e) => eventSummary(ctx, e));
      return {
        summary: `${events.length} eventos.`,
        route: "/events",
        output: { events },
      };
    },
  }),
  defineTool({
    id: "event.get",
    description:
      "Devuelve un evento con su cliente, sede, notas, tareas y propuestas.",
    input: z.object({ eventId: id }).strict(),
    roles: staff,
    effect: "read",
    describe: ({ eventId }, ctx) =>
      `Consultar el evento ${eventOf(ctx, eventId).name}`,
    run: async ({ eventId }, ctx) => {
      const e = eventOf(ctx, eventId);
      const client = ctx.workspace.clients.find((c) => c.id === e.clientId);
      const venue = ctx.workspace.venues.find((v) => v.id === e.venueId);
      return {
        summary: `Evento ${e.name} consultado.`,
        route: `/events/${e.id}`,
        output: {
          ...eventSummary(ctx, e),
          manager: e.manager,
          budget: e.budget,
          notes: e.notes,
          timezone: e.timezone,
          client: client
            ? {
                clientId: client.id,
                name: client.name,
                contact: client.contact,
                email: client.email,
              }
            : null,
          venue: venue
            ? {
                venueId: venue.id,
                name: venue.name,
                city: venue.city,
                rooms: venue.rooms.map((r) => r.name),
              }
            : null,
          tasks: ctx.workspace.tasks
            .filter((t) => t.eventId === e.id)
            .map(taskView),
          proposals: ctx.workspace.proposals
            .filter((p) => p.eventId === e.id)
            .map((p) => ({
              proposalId: p.id,
              number: p.number,
              version: p.version,
              status: p.status,
              total: quoteTotals(p.lines, p.discount, p.tax).total,
            })),
        },
      };
    },
  }),
  defineTool({
    id: "client.search",
    description:
      "Busca clientes por nombre, contacto, correo o sector (hasta 10).",
    input: z.object({ query }).strict(),
    roles: staff,
    effect: "read",
    describe: ({ query }) => `Buscar clientes «${query}»`,
    run: async ({ query }, ctx) => {
      const clients = ctx.workspace.clients
        .filter((c) => matches(query, c.name, c.contact, c.email, c.industry))
        .slice(0, 10)
        .map((c) => ({
          clientId: c.id,
          name: c.name,
          contact: c.contact,
          email: c.email,
          industry: c.industry,
        }));
      return {
        summary: `${clients.length} clientes.`,
        route: "/clients",
        output: { clients },
      };
    },
  }),
  defineTool({
    id: "client.get",
    description:
      "Devuelve un cliente con sus datos de contacto, notas y eventos.",
    input: z.object({ clientId: id }).strict(),
    roles: staff,
    effect: "read",
    describe: ({ clientId }, ctx) =>
      `Consultar el cliente ${ctx.workspace.clients.find((c) => c.id === clientId)?.name ?? clientId}`,
    run: async ({ clientId }, ctx) => {
      const c = ctx.workspace.clients.find((x) => x.id === clientId);
      if (!c)
        throw new HttpError(
          404,
          "No se encontró el cliente o no tienes acceso.",
        );
      return {
        summary: `Cliente ${c.name} consultado.`,
        route: "/clients",
        output: {
          clientId: c.id,
          name: c.name,
          contact: c.contact,
          email: c.email,
          phone: c.phone,
          industry: c.industry,
          notes: c.notes,
          events: ctx.workspace.events
            .filter((e) => e.clientId === c.id)
            .map((e) => eventSummary(ctx, e)),
        },
      };
    },
  }),
  defineTool({
    id: "task.list",
    description:
      "Lista tareas, opcionalmente de un evento y solo las pendientes.",
    input: z
      .object({ eventId: id.optional(), pending: z.boolean().optional() })
      .strict(),
    roles: staff,
    effect: "read",
    describe: () => "Listar tareas",
    run: async ({ eventId, pending }, ctx) => {
      if (eventId) eventOf(ctx, eventId);
      const tasks = ctx.workspace.tasks
        .filter(
          (t) => (!eventId || t.eventId === eventId) && (!pending || !t.done),
        )
        .slice(0, 100)
        .map(taskView);
      return {
        summary: `${tasks.length} tareas.`,
        route: "/production",
        output: { tasks },
      };
    },
  }),
  defineTool({
    id: "inventory.search",
    description:
      "Busca equipos del catálogo por nombre, categoría, SKU o descripción (hasta 25). Devuelve el equipmentId que usan las propuestas.",
    input: z
      .object({
        query: query.optional(),
        category: z.string().trim().max(100).optional(),
      })
      .strict(),
    roles: staff,
    effect: "read",
    describe: ({ query, category }) =>
      `Buscar equipos${query ? ` «${query}»` : ""}${category ? ` en ${category}` : ""}`,
    run: async ({ query, category }, ctx) => {
      const items = ctx.workspace.equipment
        .filter(
          (q) =>
            (!query ||
              matches(query, q.name, q.category, q.sku, q.description)) &&
            (!category || matches(category, q.category)),
        )
        .slice(0, 25)
        .map((q) => ({
          equipmentId: q.id,
          name: q.name,
          category: q.category,
          sku: q.sku,
          owned: q.quantity,
          inMaintenance: q.maintenance,
          rate: q.rate,
          description: q.description,
        }));
      return {
        summary: `${items.length} equipos.`,
        route: "/inventory",
        output: { items },
      };
    },
  }),
  defineTool({
    id: "inventory.get_item",
    description: "Devuelve un equipo del catálogo con su stock y tarifa.",
    input: z.object({ equipmentId: id }).strict(),
    roles: staff,
    effect: "read",
    describe: ({ equipmentId }, ctx) =>
      `Consultar ${ctx.workspace.equipment.find((q) => q.id === equipmentId)?.name ?? equipmentId}`,
    run: async ({ equipmentId }, ctx) => {
      const q = ctx.workspace.equipment.find((x) => x.id === equipmentId);
      if (!q) throw new HttpError(404, "Ese equipo no existe en el catálogo.");
      return {
        summary: `${q.name} consultado.`,
        route: "/inventory",
        output: {
          equipmentId: q.id,
          name: q.name,
          category: q.category,
          sku: q.sku,
          owned: q.quantity,
          inMaintenance: q.maintenance,
          rate: q.rate,
          description: q.description,
          activeReservations: ctx.workspace.reservations.filter(
            (r) =>
              r.equipmentId === q.id &&
              !["Returned", "Cancelled"].includes(r.status),
          ).length,
        },
      };
    },
  }),
  defineTool({
    id: "inventory.check_availability",
    description:
      "Calcula cuántas unidades de un equipo quedan libres entre dos fechas (AAAA-MM-DD) según las reservas registradas.",
    input: z
      .object({
        equipmentId: id,
        start: isoDate,
        end: isoDate,
        quantity: z.number().int().min(1).max(10_000).optional(),
      })
      .strict()
      .refine((v) => v.end >= v.start, "La fecha final precede a la inicial."),
    roles: staff,
    effect: "read",
    describe: ({ equipmentId, start, end }, ctx) =>
      `Disponibilidad de ${ctx.workspace.equipment.find((q) => q.id === equipmentId)?.name ?? equipmentId} del ${start} al ${end}`,
    run: async ({ equipmentId, start, end, quantity }, ctx) => {
      const q = ctx.workspace.equipment.find((x) => x.id === equipmentId);
      if (!q) throw new HttpError(404, "Ese equipo no existe en el catálogo.");
      const available = availableStock(
        q,
        ctx.workspace.reservations,
        start,
        end,
      );
      return {
        summary: `${available} de ${q.quantity} ${q.name} disponibles del ${start} al ${end}.`,
        route: "/inventory",
        output: {
          equipmentId: q.id,
          name: q.name,
          start,
          end,
          available,
          owned: q.quantity,
          requested: quantity ?? null,
          enough: quantity === undefined ? null : available >= quantity,
        },
      };
    },
  }),
  defineTool({
    id: "task.create",
    description:
      "Crea una tarea en un evento, asignada a quien la pide. Fecha opcional (AAAA-MM-DD; por defecto la del evento) y fase opcional.",
    input: z
      .object({
        eventId: id,
        title: z.string().trim().min(1).max(200),
        date: isoDate.optional(),
        phase: z.string().trim().min(1).max(60).optional(),
      })
      .strict(),
    roles: ["Administrator", "Production Manager"],
    effect: "draft",
    describe: ({ eventId, title }, ctx) =>
      `Crear la tarea «${title}» en ${eventOf(ctx, eventId).name}`,
    run: async ({ eventId, title, date, phase }, ctx) => {
      const event = eventOf(ctx, eventId);
      const task: Task = {
        id: randomUUID(),
        eventId: event.id,
        title,
        assignee: ctx.user.name,
        assigneeId: ctx.user.id,
        role: ctx.user.role,
        date: date ?? event.date,
        done: false,
        phase: phase ?? "Planning",
      };
      return {
        changes: [{ collection: "tasks", id: task.id, value: task }],
        eventId: event.id,
        summary: `Tarea «${task.title}» creada en ${event.name}.`,
        route: `/events/${event.id}`,
        output: taskView(task),
      };
    },
  }),
  defineTool({
    id: "task.update",
    description:
      "Cambia título, fecha, fase o estado (done) de una tarea existente.",
    input: z
      .object({
        taskId: id,
        title: z.string().trim().min(1).max(200).optional(),
        date: isoDate.optional(),
        phase: z.string().trim().min(1).max(60).optional(),
        done: z.boolean().optional(),
      })
      .strict()
      .refine(
        (v) => [v.title, v.date, v.phase, v.done].some((x) => x !== undefined),
        "Indica qué cambiar.",
      ),
    roles: ["Administrator", "Production Manager", "Technician"],
    effect: "draft",
    describe: ({ taskId, done }, ctx) => {
      const t = ctx.workspace.tasks.find((x) => x.id === taskId);
      return `${done === true ? "Completar" : done === false ? "Reabrir" : "Actualizar"} la tarea «${t?.title ?? taskId}»`;
    },
    run: async ({ taskId, ...values }, ctx) => {
      const current = ctx.workspace.tasks.find((t) => t.id === taskId);
      if (!current)
        throw new HttpError(404, "No se encontró la tarea o no tienes acceso.");
      const task: Task = { ...current };
      if (values.title !== undefined) task.title = values.title;
      if (values.date !== undefined) task.date = values.date;
      if (values.phase !== undefined) task.phase = values.phase;
      if (values.done !== undefined) task.done = values.done;
      return {
        changes: [{ collection: "tasks", id: task.id, value: task }],
        eventId: task.eventId,
        summary: `Tarea «${task.title}» actualizada.`,
        route: `/events/${task.eventId}`,
        output: taskView(task),
      };
    },
  }),
];
