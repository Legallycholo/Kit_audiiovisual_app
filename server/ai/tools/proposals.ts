import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Proposal, QuoteLine } from "../../../src/shared/types";
import { nextProposalNumber, quoteTotals } from "../../../src/shared/domain";
import { HttpError } from "../../database";
import {
  catalogOf,
  materializeSuggestion,
  proposalContext,
  proposalEditContext,
  type DraftSuggestion,
  type ProposalContext,
} from "../../proposal-ai";
import { defineTool, type ToolContext, type ToolOutcome } from "../tools";

/**
 * Proposal tools for KIT. Text and line edits are `draft` changes; anything
 * that sets money (discount, tax, a custom rate, payment terms) is
 * `financial` and always confirmed. Catalog lines take the catalog rate; the
 * model never supplies a price (the strict schemas reject one).
 */
const commercial = ["Administrator", "Sales Manager"] as const;
const id = z.string().min(1).max(100);
const text = z.string().trim().max(20_000);
const quantity = z.number().int().min(1).max(10_000);
const days = z.number().int().min(1).max(365);
const percent = z.number().min(0).max(100);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "fecha AAAA-MM-DD");

export const DEFAULT_PROPOSAL_TERMS =
  "La disponibilidad, las condiciones de pago y el alcance final están sujetos a revisión.";
const inThirtyDays = (now: string) =>
  new Date(Date.parse(now) + 30 * 86_400_000).toISOString().slice(0, 10);
const statusLabels: Record<Proposal["status"], string> = {
  Draft: "en borrador",
  "In review": "en revisión",
  "Ready to send": "lista para enviar",
  Issued: "emitida",
  Accepted: "aceptada",
  Declined: "rechazada",
  Superseded: "reemplazada",
};
const label = (p: Proposal) => `${p.number} v${p.version}`;
const route = (p: Proposal) => `/proposals/${p.id}`;

function find(ctx: ToolContext, proposalId: string): Proposal {
  const p = ctx.workspace.proposals.find((q) => q.id === proposalId);
  if (!p)
    throw new HttpError(404, "No se encontró la propuesta o no tienes acceso.");
  return p;
}
/** An editable copy. Issued and accepted revisions never change (applyChanges enforces it too). */
function editable(ctx: ToolContext, proposalId: string): Proposal {
  const p = find(ctx, proposalId);
  if (
    !["Draft", "In review", "Ready to send"].includes(p.status) ||
    p.acceptedAt
  )
    throw new HttpError(
      409,
      `La propuesta ${label(p)} está ${statusLabels[p.status]}; crea una nueva revisión para cambiarla.`,
    );
  return {
    ...structuredClone(p),
    status: "Draft",
    updatedAt: ctx.services.now(),
  };
}
const totals = (p: Proposal) => quoteTotals(p.lines, p.discount, p.tax);
function view(p: Proposal) {
  return {
    proposalId: p.id,
    number: p.number,
    version: p.version,
    status: p.status,
    eventId: p.eventId || null,
    documentType: p.documentType ?? "PROPUESTA",
    title: p.title,
    introduction: p.introduction,
    scope: p.scope ?? "",
    notes: p.notes ?? "",
    terms: p.terms,
    paymentTerms: p.paymentTerms ?? "",
    validUntil: p.validUntil,
    discount: p.discount,
    tax: p.tax,
    lines: p.lines.map((l) => ({
      lineId: l.id,
      equipmentId: l.equipmentId ?? null,
      description: l.description,
      quantity: l.quantity,
      days: l.days,
      rate: l.rate,
    })),
    totals: totals(p),
    questions: p.aiReview?.questions ?? [],
  };
}
function saved(
  p: Proposal,
  summary: string,
  extra: Record<string, unknown> = {},
): ToolOutcome {
  return {
    changes: [{ collection: "proposals", id: p.id, value: p }],
    eventId: p.eventId || undefined,
    summary,
    route: route(p),
    output: { ...view(p), ...extra },
  };
}
function issues(ctx: ToolContext, p: Proposal): string[] {
  const list: string[] = [];
  const event = ctx.workspace.events.find((e) => e.id === p.eventId);
  if (!p.eventId) list.push("La propuesta no está vinculada a un evento.");
  else if (!event) list.push("El evento vinculado no está disponible.");
  if (!p.title.trim()) list.push("Falta el título.");
  if (!p.introduction.trim()) list.push("Falta la introducción.");
  if (!p.lines.length) list.push("No hay equipos ni servicios.");
  for (const l of p.lines)
    if (l.rate === 0)
      list.push(
        l.equipmentId
          ? `La tarifa de «${l.description}» es cero en el catálogo.`
          : `Falta el precio del servicio «${l.description}».`,
      );
  if (!p.validUntil) list.push("Falta la fecha de validez.");
  else if (p.validUntil < ctx.services.now().slice(0, 10))
    list.push("La fecha de validez ya pasó.");
  if (!p.paymentTerms?.trim())
    list.push("No se indicaron condiciones de pago.");
  return list;
}

async function generated(
  ctx: ToolContext,
  context: ProposalContext,
): Promise<DraftSuggestion> {
  const generator = ctx.services.proposal;
  if (!generator)
    throw new HttpError(
      503,
      "La redacción con IA no está configurada; la propuesta se puede crear y editar manualmente.",
    );
  await ctx.services.limit?.(`ai:user:${ctx.user.id}`, 10);
  await ctx.services.limit?.("ai:company", 30);
  const raw = await generator.generate(context);
  if (ctx.signal?.aborted) throw new HttpError(409, "Generación detenida.");
  return materializeSuggestion(raw, context, generator.model);
}
/** Applies a reviewed suggestion; custom lines keep a price already typed; a discount becomes a question, never a change. */
function applySuggestion(p: Proposal, s: DraftSuggestion): string[] {
  const before = p.lines;
  p.title = s.title;
  p.introduction = s.introduction;
  if (s.scope !== undefined) p.scope = s.scope;
  if (s.notes !== undefined) p.notes = s.notes;
  if (s.terms !== undefined) p.terms = s.terms;
  p.lines = s.lines.map((line) => {
    const known = !line.equipmentId
      ? before.find(
          (existing) =>
            !existing.equipmentId &&
            existing.description.trim().toLowerCase() ===
              line.description.trim().toLowerCase(),
        )
      : undefined;
    return known ? { ...line, rate: known.rate } : line;
  });
  const questions = [...s.aiReview.questions];
  if (s.discount !== undefined && s.discount !== p.discount)
    questions.push(
      `KIT sugiere un descuento del ${s.discount} %: aplícalo como cambio financiero confirmado.`,
    );
  p.aiReview = { ...s.aiReview, questions: [...new Set(questions)] };
  return p.aiReview.questions;
}
function briefContext(ctx: ToolContext, brief: string): ProposalContext {
  return {
    brief,
    event: {
      name: "",
      type: "",
      date: "",
      endDate: "",
      attendees: 0,
      notes: "",
    },
    client: { name: "" },
    equipment: catalogOf(ctx.workspace),
  };
}
const lineText = (l: QuoteLine) =>
  `${l.quantity} × ${l.description}${l.days > 1 ? ` · ${l.days} días` : ""}`;

export const proposalTools = [
  defineTool({
    id: "proposal.get",
    description:
      "Devuelve una propuesta: textos, líneas con sus identificadores, descuento, impuesto, totales calculados y preguntas pendientes.",
    input: z.object({ proposalId: id }).strict(),
    roles: commercial,
    effect: "read",
    describe: ({ proposalId }, ctx) =>
      `Consultar la propuesta ${label(find(ctx, proposalId))}`,
    run: async ({ proposalId }, ctx) => {
      const p = find(ctx, proposalId);
      return {
        summary: `Propuesta ${label(p)} consultada.`,
        route: route(p),
        output: view(p),
      };
    },
  }),
  defineTool({
    id: "proposal.validate",
    description:
      "Revisa qué falta en una propuesta antes de enviarla (evento, textos, líneas, precios, validez, condiciones de pago).",
    input: z.object({ proposalId: id }).strict(),
    roles: commercial,
    effect: "read",
    describe: ({ proposalId }, ctx) =>
      `Revisar la propuesta ${label(find(ctx, proposalId))}`,
    run: async ({ proposalId }, ctx) => {
      const p = find(ctx, proposalId);
      const list = issues(ctx, p);
      return {
        summary: list.length
          ? `${list.length} puntos por resolver.`
          : "La propuesta está completa.",
        route: route(p),
        output: {
          proposalId: p.id,
          number: p.number,
          status: p.status,
          issues: list,
          totals: totals(p),
        },
      };
    },
  }),
  defineTool({
    id: "proposal.create_draft",
    description:
      "Crea una nueva propuesta en borrador (documento KIT Classic). Opcional: evento al que pertenece, título y un brief en lenguaje natural para que KIT redacte el contenido y seleccione equipos del catálogo (sin precios inventados).",
    input: z
      .object({
        eventId: id.optional(),
        title: z.string().trim().min(1).max(200).optional(),
        brief: z.string().trim().min(10).max(6000).optional(),
        documentType: z.enum(["PROPUESTA", "COTIZACIÓN"]).optional(),
      })
      .strict(),
    roles: commercial,
    effect: "draft",
    slow: true,
    describe: ({ eventId, title, brief }, ctx) => {
      const event = eventId
        ? ctx.workspace.events.find((e) => e.id === eventId)
        : undefined;
      return `Crear una propuesta${title ? ` «${title}»` : ""}${event ? ` para ${event.name}` : ""}${brief ? " con contenido redactado por KIT" : ""}`;
    },
    run: async (input, ctx) => {
      const event = input.eventId
        ? ctx.workspace.events.find((e) => e.id === input.eventId)
        : undefined;
      if (input.eventId && !event)
        throw new HttpError(
          404,
          "No se encontró el evento o no tienes acceso.",
        );
      const now = ctx.services.now();
      const p: Proposal = {
        id: randomUUID(),
        number: nextProposalNumber(ctx.workspace.proposals, new Date(now)),
        eventId: event?.id ?? "",
        version: 1,
        title: input.title || event?.name || "Nueva propuesta",
        introduction: event?.notes ?? "",
        terms: DEFAULT_PROPOSAL_TERMS,
        lines: [],
        discount: 0,
        tax: 0,
        status: "Draft",
        validUntil: event?.date || inThirtyDays(now),
        presentationTemplate: "Classic",
        documentType: input.documentType ?? "PROPUESTA",
        updatedAt: now,
      };
      let questions: string[] = [];
      if (input.brief) {
        const context = event
          ? proposalContext(ctx.workspace, event.id, input.brief)
          : briefContext(ctx, input.brief);
        const suggestion = await generated(ctx, context);
        questions = applySuggestion(p, suggestion);
        if (input.title) p.title = input.title;
      }
      return saved(
        p,
        `Propuesta ${label(p)} «${p.title}» creada${input.brief ? " con contenido de KIT" : ""}.`,
        { questions },
      );
    },
  }),
  defineTool({
    id: "proposal.generate_content",
    description:
      "Redacta o reescribe el contenido de una propuesta existente según un brief (textos y selección de equipos del catálogo). Conserva lo que el brief no pide cambiar. Nunca cambia descuento ni impuestos.",
    input: z
      .object({ proposalId: id, brief: z.string().trim().min(10).max(6000) })
      .strict(),
    roles: commercial,
    effect: "draft",
    slow: true,
    describe: ({ proposalId }, ctx) =>
      `Redactar con KIT la propuesta ${label(find(ctx, proposalId))}`,
    run: async ({ proposalId, brief }, ctx) => {
      const p = editable(ctx, proposalId);
      const suggestion = await generated(
        ctx,
        proposalEditContext(ctx.workspace, proposalId, brief),
      );
      const questions = applySuggestion(p, suggestion);
      return saved(p, `Contenido de ${label(p)} redactado por KIT.`, {
        questions,
      });
    },
  }),
  defineTool({
    id: "proposal.update_section",
    description:
      "Reemplaza el texto de una sección de la propuesta (title, introduction, scope, notes o terms). Las demás secciones no cambian.",
    input: z
      .object({
        proposalId: id,
        section: z.enum(["title", "introduction", "scope", "notes", "terms"]),
        text: text.min(1),
      })
      .strict(),
    roles: commercial,
    effect: "draft",
    describe: ({ proposalId, section }, ctx) =>
      `Actualizar ${sectionLabels[section]} de ${label(find(ctx, proposalId))}`,
    run: async ({ proposalId, section, text }, ctx) => {
      const p = editable(ctx, proposalId);
      if (section === "title") p.title = text.slice(0, 200);
      else p[section] = text;
      return saved(
        p,
        `${capital(sectionLabels[section])} de ${label(p)} actualizada.`,
      );
    },
  }),
  defineTool({
    id: "proposal.add_catalog_item",
    description:
      "Añade un equipo del catálogo a la propuesta con su tarifa de catálogo. Usa inventory.search para encontrar el equipmentId.",
    input: z
      .object({
        proposalId: id,
        equipmentId: id,
        quantity: quantity.default(1),
        days: days.default(1),
      })
      .strict(),
    roles: commercial,
    effect: "draft",
    describe: ({ proposalId, equipmentId, quantity, days }, ctx) => {
      const item = ctx.workspace.equipment.find((q) => q.id === equipmentId);
      return `Añadir ${quantity} × ${item?.name ?? equipmentId}${days > 1 ? ` · ${days} días` : ""} a ${label(find(ctx, proposalId))}`;
    },
    run: async ({ proposalId, equipmentId, quantity, days }, ctx) => {
      const p = editable(ctx, proposalId);
      const item = ctx.workspace.equipment.find((q) => q.id === equipmentId);
      if (!item)
        throw new HttpError(
          422,
          "Ese equipo no existe en el catálogo; busca con inventory.search.",
        );
      if (p.lines.some((l) => l.equipmentId === item.id))
        throw new HttpError(
          409,
          `«${item.name}» ya está en la propuesta; cambia la cantidad con proposal.update_line.`,
        );
      const line: QuoteLine = {
        id: randomUUID(),
        equipmentId: item.id,
        description: item.name,
        quantity,
        days,
        rate: item.rate,
      };
      p.lines = [...p.lines, line];
      return saved(p, `${lineText(line)} añadido a ${label(p)}.`, {
        lineId: line.id,
      });
    },
  }),
  defineTool({
    id: "proposal.add_custom_item",
    description:
      "Añade un servicio que no está en el catálogo (técnicos, transporte, cableado). Se añade sin precio: la persona lo fija después.",
    input: z
      .object({
        proposalId: id,
        description: z.string().trim().min(1).max(200),
        quantity: quantity.default(1),
        days: days.default(1),
      })
      .strict(),
    roles: commercial,
    effect: "draft",
    describe: ({ proposalId, description, quantity }, ctx) =>
      `Añadir ${quantity} × ${description} (sin precio) a ${label(find(ctx, proposalId))}`,
    run: async ({ proposalId, description, quantity, days }, ctx) => {
      const p = editable(ctx, proposalId);
      const line: QuoteLine = {
        id: randomUUID(),
        description,
        quantity,
        days,
        rate: 0,
      };
      p.lines = [...p.lines, line];
      return saved(p, `${lineText(line)} añadido a ${label(p)} sin precio.`, {
        lineId: line.id,
        note: `Indicar el precio de «${description}»: KIT no inventa precios.`,
      });
    },
  }),
  defineTool({
    id: "proposal.update_line",
    description:
      "Cambia cantidad, días o descripción de una línea existente (usa el lineId de proposal.get). No cambia precios.",
    input: z
      .object({
        proposalId: id,
        lineId: id,
        quantity: quantity.optional(),
        days: days.optional(),
        description: z.string().trim().min(1).max(200).optional(),
      })
      .strict()
      .refine(
        (v) =>
          v.quantity !== undefined ||
          v.days !== undefined ||
          v.description !== undefined,
        "Indica qué cambiar.",
      ),
    roles: commercial,
    effect: "draft",
    describe: ({ proposalId, lineId }, ctx) => {
      const p = find(ctx, proposalId);
      const l = p.lines.find((x) => x.id === lineId);
      return `Modificar «${l?.description ?? lineId}» en ${label(p)}`;
    },
    run: async ({ proposalId, lineId, ...values }, ctx) => {
      const p = editable(ctx, proposalId);
      const index = p.lines.findIndex((l) => l.id === lineId);
      if (index < 0)
        throw new HttpError(404, "Esa línea no está en la propuesta.");
      const line = { ...p.lines[index] };
      if (values.quantity !== undefined) line.quantity = values.quantity;
      if (values.days !== undefined) line.days = values.days;
      if (values.description !== undefined)
        line.description = values.description;
      p.lines = p.lines.map((l, i) => (i === index ? line : l));
      return saved(p, `${lineText(line)} actualizado en ${label(p)}.`);
    },
  }),
  defineTool({
    id: "proposal.remove_line",
    description:
      "Quita una línea de la propuesta (usa el lineId de proposal.get).",
    input: z.object({ proposalId: id, lineId: id }).strict(),
    roles: commercial,
    effect: "draft",
    describe: ({ proposalId, lineId }, ctx) => {
      const p = find(ctx, proposalId);
      const l = p.lines.find((x) => x.id === lineId);
      return `Quitar «${l?.description ?? lineId}» de ${label(p)}`;
    },
    run: async ({ proposalId, lineId }, ctx) => {
      const p = editable(ctx, proposalId);
      const line = p.lines.find((l) => l.id === lineId);
      if (!line) throw new HttpError(404, "Esa línea no está en la propuesta.");
      p.lines = p.lines.filter((l) => l.id !== lineId);
      return saved(p, `${lineText(line)} quitado de ${label(p)}.`);
    },
  }),
  defineTool({
    id: "proposal.set_discount",
    description:
      "Fija el descuento global (%) de la propuesta. Cambio financiero: requiere confirmación.",
    input: z.object({ proposalId: id, discount: percent }).strict(),
    roles: commercial,
    effect: "financial",
    describe: ({ proposalId, discount }, ctx) => {
      const p = find(ctx, proposalId);
      return `Cambiar el descuento de ${label(p)} de ${p.discount} % a ${discount} %`;
    },
    run: async ({ proposalId, discount }, ctx) => {
      const p = editable(ctx, proposalId);
      p.discount = discount;
      return saved(p, `Descuento de ${label(p)} fijado en ${discount} %.`);
    },
  }),
  defineTool({
    id: "proposal.set_tax",
    description:
      "Fija el impuesto (%) de la propuesta. Cambio financiero: requiere confirmación.",
    input: z.object({ proposalId: id, tax: percent }).strict(),
    roles: commercial,
    effect: "financial",
    describe: ({ proposalId, tax }, ctx) => {
      const p = find(ctx, proposalId);
      return `Cambiar el impuesto de ${label(p)} de ${p.tax} % a ${tax} %`;
    },
    run: async ({ proposalId, tax }, ctx) => {
      const p = editable(ctx, proposalId);
      p.tax = tax;
      return saved(p, `Impuesto de ${label(p)} fijado en ${tax} %.`);
    },
  }),
  defineTool({
    id: "proposal.set_custom_rate",
    description:
      "Fija el precio unitario de un servicio personalizado (línea sin equipmentId) con el valor que indicó la persona. Cambio financiero: requiere confirmación. Las tarifas del catálogo se cambian en Inventario.",
    input: z
      .object({
        proposalId: id,
        lineId: id,
        rate: z.number().finite().min(0).max(100_000_000),
      })
      .strict(),
    roles: commercial,
    effect: "financial",
    describe: ({ proposalId, lineId, rate }, ctx) => {
      const p = find(ctx, proposalId);
      const l = p.lines.find((x) => x.id === lineId);
      return `Fijar el precio de «${l?.description ?? lineId}» en ${rate} en ${label(p)}`;
    },
    run: async ({ proposalId, lineId, rate }, ctx) => {
      const p = editable(ctx, proposalId);
      const line = p.lines.find((l) => l.id === lineId);
      if (!line) throw new HttpError(404, "Esa línea no está en la propuesta.");
      if (line.equipmentId)
        throw new HttpError(
          422,
          "Las tarifas del catálogo se cambian en Inventario, no en la propuesta.",
        );
      p.lines = p.lines.map((l) => (l.id === lineId ? { ...l, rate } : l));
      return saved(p, `Precio de «${line.description}» fijado en ${rate}.`);
    },
  }),
  defineTool({
    id: "proposal.set_payment_terms",
    description:
      "Fija las condiciones de pago de la propuesta. Cambio financiero: requiere confirmación.",
    input: z
      .object({ proposalId: id, paymentTerms: z.string().trim().max(500) })
      .strict(),
    roles: commercial,
    effect: "financial",
    describe: ({ proposalId }, ctx) =>
      `Cambiar las condiciones de pago de ${label(find(ctx, proposalId))}`,
    run: async ({ proposalId, paymentTerms }, ctx) => {
      const p = editable(ctx, proposalId);
      p.paymentTerms = paymentTerms;
      return saved(p, `Condiciones de pago de ${label(p)} actualizadas.`);
    },
  }),
  defineTool({
    id: "proposal.link_event",
    description:
      "Vincula una propuesta sin evento a un evento existente (una vez vinculada no se mueve).",
    input: z.object({ proposalId: id, eventId: id }).strict(),
    roles: commercial,
    effect: "draft",
    describe: ({ proposalId, eventId }, ctx) =>
      `Vincular ${label(find(ctx, proposalId))} al evento ${ctx.workspace.events.find((e) => e.id === eventId)?.name ?? eventId}`,
    run: async ({ proposalId, eventId }, ctx) => {
      const p = editable(ctx, proposalId);
      const event = ctx.workspace.events.find((e) => e.id === eventId);
      if (!event)
        throw new HttpError(
          404,
          "No se encontró el evento o no tienes acceso.",
        );
      if (p.eventId && p.eventId !== eventId)
        throw new HttpError(
          409,
          "La propuesta ya pertenece a otro evento; crea una nueva.",
        );
      p.eventId = event.id;
      p.validUntil ||= event.date;
      if (!p.title.trim()) p.title = event.name;
      return saved(p, `${label(p)} vinculada a ${event.name}.`);
    },
  }),
  defineTool({
    id: "proposal.set_validity",
    description: "Fija la fecha de validez (AAAA-MM-DD) de la propuesta.",
    input: z.object({ proposalId: id, validUntil: isoDate }).strict(),
    roles: commercial,
    effect: "draft",
    describe: ({ proposalId, validUntil }, ctx) =>
      `Fijar la validez de ${label(find(ctx, proposalId))} hasta ${validUntil}`,
    run: async ({ proposalId, validUntil }, ctx) => {
      const p = editable(ctx, proposalId);
      p.validUntil = validUntil;
      return saved(p, `Validez de ${label(p)} fijada hasta ${validUntil}.`);
    },
  }),
];
const sectionLabels = {
  title: "el título",
  introduction: "la introducción",
  scope: "el alcance",
  notes: "las notas",
  terms: "los términos",
} as const;
const capital = (s: string) =>
  s.replace(/^(el|la|los|las) /, "").replace(/^./, (c) => c.toUpperCase());
