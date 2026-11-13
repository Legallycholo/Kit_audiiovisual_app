import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Client, ProductionEvent } from "../../../src/shared/types";
import { initials } from "../../../src/shared/domain";
import { HttpError } from "../../database";
import { defineTool, type ToolContext } from "../tools";

/**
 * Client and event writes. Creating or editing these records is a draft
 * change (recoverable, no money committed); an event budget is financial.
 * The shared write policy still applies: production managers may only move
 * an event's status, sales and administrators edit the rest.
 */
const commercial = ["Administrator", "Sales Manager"] as const;
const planners = [
  "Administrator",
  "Sales Manager",
  "Production Manager",
] as const;
const id = z.string().min(1).max(100);
const name = z.string().trim().min(1).max(200);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");
const eventStatus = z.enum([
  "Planning",
  "Confirmed",
  "Preparation",
  "In production",
  "Completed",
  "Cancelled",
]);
const email = z.union([z.email(), z.literal("")]);

function clientOf(ctx: ToolContext, clientId: string): Client {
  const c = ctx.workspace.clients.find((x) => x.id === clientId);
  if (!c)
    throw new HttpError(404, "No se encontró el cliente o no tienes acceso.");
  return c;
}
function eventOf(ctx: ToolContext, eventId: string): ProductionEvent {
  const e = ctx.workspace.events.find((x) => x.id === eventId);
  if (!e)
    throw new HttpError(404, "No se encontró el evento o no tienes acceso.");
  return e;
}
const clientView = (c: Client) => ({
  clientId: c.id,
  name: c.name,
  contact: c.contact,
  email: c.email,
  phone: c.phone,
  industry: c.industry,
  notes: c.notes,
});
const eventView = (e: ProductionEvent) => ({
  eventId: e.id,
  name: e.name,
  clientId: e.clientId,
  venueId: e.venueId || null,
  date: e.date,
  endDate: e.endDate,
  status: e.status,
  type: e.type,
  manager: e.manager,
  attendees: e.attendees,
  budget: e.budget,
  notes: e.notes,
  timezone: e.timezone,
});

export const directoryTools = [
  defineTool({
    id: "client.create",
    description:
      "Crea un cliente nuevo con nombre y contacto principal; correo, teléfono, sector y notas son opcionales. Busca antes con client.search para no duplicar.",
    input: z
      .object({
        name,
        contact: name,
        email: email.optional(),
        phone: z.string().trim().max(60).optional(),
        industry: z.string().trim().min(1).max(200).optional(),
        notes: z.string().trim().max(20_000).optional(),
      })
      .strict(),
    roles: commercial,
    effect: "draft",
    describe: ({ name }) => `Crear el cliente «${name}»`,
    run: async (input, ctx) => {
      const duplicate = ctx.workspace.clients.find(
        (c) =>
          c.name.trim().toLowerCase() === input.name.toLowerCase() ||
          (input.email && c.email.toLowerCase() === input.email.toLowerCase()),
      );
      if (duplicate)
        throw new HttpError(
          409,
          `Ya existe el cliente «${duplicate.name}» (${duplicate.id}); usa client.update.`,
        );
      const client: Client = {
        id: randomUUID(),
        name: input.name,
        contact: input.contact,
        email: input.email ?? "",
        phone: input.phone ?? "",
        industry: input.industry ?? "Corporate",
        initials: initials(input.name),
        color: "sage",
        notes: input.notes ?? "",
      };
      return {
        changes: [{ collection: "clients", id: client.id, value: client }],
        summary: `Cliente «${client.name}» creado.`,
        route: "/clients",
        output: clientView(client),
      };
    },
  }),
  defineTool({
    id: "client.update",
    description:
      "Actualiza los datos de contacto, sector o notas de un cliente existente.",
    input: z
      .object({
        clientId: id,
        name: name.optional(),
        contact: name.optional(),
        email: email.optional(),
        phone: z.string().trim().max(60).optional(),
        industry: z.string().trim().min(1).max(200).optional(),
        notes: z.string().trim().max(20_000).optional(),
      })
      .strict()
      .refine(
        (v) =>
          Object.keys(v).some(
            (k) => k !== "clientId" && v[k as keyof typeof v] !== undefined,
          ),
        "Indica qué cambiar.",
      ),
    roles: commercial,
    effect: "draft",
    describe: ({ clientId }, ctx) =>
      `Actualizar el cliente «${clientOf(ctx, clientId).name}»`,
    run: async ({ clientId, ...values }, ctx) => {
      const current = clientOf(ctx, clientId);
      const client: Client = { ...current };
      if (values.name !== undefined) {
        client.name = values.name;
        client.initials = initials(values.name);
      }
      if (values.contact !== undefined) client.contact = values.contact;
      if (values.email !== undefined) client.email = values.email;
      if (values.phone !== undefined) client.phone = values.phone;
      if (values.industry !== undefined) client.industry = values.industry;
      if (values.notes !== undefined) client.notes = values.notes;
      return {
        changes: [{ collection: "clients", id: client.id, value: client }],
        summary: `Cliente «${client.name}» actualizado.`,
        route: "/clients",
        output: clientView(client),
      };
    },
  }),
  defineTool({
    id: "event.create",
    description:
      "Crea un evento para un cliente existente: nombre, tipo, fecha de inicio (AAAA-MM-DD); fin, sede, asistentes y notas opcionales. El presupuesto se fija aparte con event.set_budget.",
    input: z
      .object({
        name,
        clientId: id,
        type: name,
        date: isoDate,
        endDate: isoDate.optional(),
        venueId: id.optional(),
        attendees: z.number().int().min(0).max(1_000_000).optional(),
        notes: z.string().trim().max(20_000).optional(),
        status: eventStatus.optional(),
      })
      .strict()
      .refine(
        (v) => !v.endDate || v.endDate >= v.date,
        "La fecha final precede a la inicial.",
      ),
    roles: commercial,
    effect: "draft",
    describe: ({ name, clientId }, ctx) =>
      `Crear el evento «${name}» para ${clientOf(ctx, clientId).name}`,
    run: async (input, ctx) => {
      const client = clientOf(ctx, input.clientId);
      if (
        input.venueId &&
        !ctx.workspace.venues.some((v) => v.id === input.venueId)
      )
        throw new HttpError(404, "No se encontró la sede.");
      const event: ProductionEvent = {
        id: randomUUID(),
        name: input.name,
        clientId: client.id,
        venueId: input.venueId ?? "",
        date: input.date,
        endDate: input.endDate ?? input.date,
        status: input.status ?? "Planning",
        type: input.type,
        manager: ctx.user.name,
        budget: 0,
        attendees: input.attendees ?? 0,
        notes: input.notes ?? "",
        // New events take the company time zone, as the Events screen does.
        timezone: ctx.workspace.settings.timezone,
      };
      return {
        changes: [{ collection: "events", id: event.id, value: event }],
        eventId: event.id,
        summary: `Evento «${event.name}» creado para ${client.name} el ${event.date}.`,
        route: `/events/${event.id}`,
        output: eventView(event),
      };
    },
  }),
  defineTool({
    id: "event.update",
    description:
      "Actualiza nombre, tipo, fechas, sede, asistentes, notas o estado de un evento. No cambia el presupuesto (event.set_budget) ni el cliente.",
    input: z
      .object({
        eventId: id,
        name: name.optional(),
        type: name.optional(),
        date: isoDate.optional(),
        endDate: isoDate.optional(),
        venueId: id.optional(),
        attendees: z.number().int().min(0).max(1_000_000).optional(),
        notes: z.string().trim().max(20_000).optional(),
        status: eventStatus.optional(),
      })
      .strict()
      .refine(
        (v) =>
          Object.keys(v).some(
            (k) => k !== "eventId" && v[k as keyof typeof v] !== undefined,
          ),
        "Indica qué cambiar.",
      ),
    roles: planners,
    effect: "draft",
    describe: ({ eventId, status }, ctx) =>
      `${status ? `Cambiar el estado a ${status} de` : "Actualizar"} el evento «${eventOf(ctx, eventId).name}»`,
    run: async ({ eventId, ...values }, ctx) => {
      const current = eventOf(ctx, eventId);
      if (
        values.venueId &&
        !ctx.workspace.venues.some((v) => v.id === values.venueId)
      )
        throw new HttpError(404, "No se encontró la sede.");
      const event: ProductionEvent = { ...current };
      if (values.name !== undefined) event.name = values.name;
      if (values.type !== undefined) event.type = values.type;
      if (values.date !== undefined) event.date = values.date;
      if (values.endDate !== undefined) event.endDate = values.endDate;
      if (values.venueId !== undefined) event.venueId = values.venueId;
      if (values.attendees !== undefined) event.attendees = values.attendees;
      if (values.notes !== undefined) event.notes = values.notes;
      if (values.status !== undefined) event.status = values.status;
      if (
        values.date !== undefined &&
        values.endDate === undefined &&
        event.endDate < event.date
      )
        event.endDate = event.date;
      if (event.endDate < event.date)
        throw new HttpError(422, "La fecha final precede a la inicial.");
      return {
        changes: [{ collection: "events", id: event.id, value: event }],
        eventId: event.id,
        summary: `Evento «${event.name}» actualizado.`,
        route: `/events/${event.id}`,
        output: eventView(event),
      };
    },
  }),
  defineTool({
    id: "event.set_budget",
    description:
      "Fija el presupuesto estimado de un evento. Cambio financiero: requiere confirmación.",
    input: z
      .object({
        eventId: id,
        budget: z.number().finite().min(0).max(100_000_000),
      })
      .strict(),
    roles: commercial,
    effect: "financial",
    describe: ({ eventId, budget }, ctx) => {
      const e = eventOf(ctx, eventId);
      return `Cambiar el presupuesto de «${e.name}» de ${e.budget} a ${budget}`;
    },
    run: async ({ eventId, budget }, ctx) => {
      const event: ProductionEvent = { ...eventOf(ctx, eventId), budget };
      return {
        changes: [{ collection: "events", id: event.id, value: event }],
        eventId: event.id,
        summary: `Presupuesto de «${event.name}» fijado en ${budget}.`,
        route: `/events/${event.id}`,
        output: eventView(event),
      };
    },
  }),
];
