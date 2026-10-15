import { z } from "zod";
import { roles } from "../src/shared/access";

export const identifier = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const text = z.string().max(20_000);
const name = z.string().trim().min(1).max(200);
const count = z.number().int().min(0).max(1_000_000);
const amount = z.number().finite().min(0).max(100_000_000);
const dimension = z.number().finite().positive().max(10_000);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const d = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
    );
  }, "Invalid date");
const object = z
  .object({
    id: identifier,
    kind: z.enum([
      "Stage",
      "Table",
      "Chair",
      "Booth",
      "LED wall",
      "Speaker",
      "Light",
      "Truss",
      "Exit",
      "Screen",
      "Decoration",
    ]),
    x: z.number().finite().min(0).max(10_000),
    y: z.number().finite().min(0).max(10_000),
    width: dimension,
    depth: dimension,
    height: dimension,
    rotation: z.number().finite().min(-3600).max(3600),
    label: name,
    layer: name,
    equipmentId: identifier.optional(),
    equipmentQuantity: z.number().int().positive().max(1_000_000).optional(),
  })
  .strict();
const layoutReference = z
  .object({
    name,
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataUrl: z
      .string()
      .max(1_500_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,/),
    intrinsicWidth: z.number().int().positive().max(50_000),
    intrinsicHeight: z.number().int().positive().max(50_000),
    opacity: z.number().finite().min(0.05).max(1),
    calibratedAt: z.string().datetime().optional(),
  })
  .strict();
const line = z
  .object({
    id: identifier,
    equipmentId: identifier.optional(),
    description: name,
    quantity: amount,
    rate: amount,
    days: amount,
  })
  .strict();
const message = z
  .object({
    id: identifier,
    direction: z.enum(["in", "out"]),
    text,
    at: z.string().datetime({ offset: true }),
    proposalId: identifier.optional(),
    proposalVersion: z.number().int().positive().optional(),
    status: z.enum([
      "Received",
      "Sample sent",
      "Draft",
      "Queued",
      "Sent",
      "Delivered",
      "Failed",
    ]),
    channel: name.optional(),
    createdBy: identifier.optional(),
    approvedBy: identifier.optional(),
    approvedAt: z.string().datetime().optional(),
    sentAt: z.string().datetime().optional(),
    providerMessageId: z.string().max(500).optional(),
    failureReason: z.string().max(2000).optional(),
  })
  .strict();
export const schemas = {
  clients: z
    .object({
      id: identifier,
      name,
      contact: name,
      email: z.union([z.email(), z.literal("")]),
      phone: z.string().max(60),
      industry: name,
      initials: z.string().max(8),
      color: z.enum(["sage", "lavender", "peach", "blue"]),
      notes: text,
    })
    .strict(),
  venues: z
    .object({
      id: identifier,
      name,
      city: name,
      category: name,
      rooms: z
        .array(
          z
            .object({
              id: identifier,
              name,
              width: dimension,
              depth: dimension,
              height: dimension,
              capacity: count,
            })
            .strict(),
        )
        .max(200),
      notes: text,
      color: z.enum(["sage", "lavender", "peach", "blue"]),
    })
    .strict(),
  events: z
    .object({
      id: identifier,
      name,
      clientId: identifier,
      venueId: z.union([identifier, z.literal("")]),
      date,
      endDate: date,
      status: z.enum([
        "Planning",
        "Confirmed",
        "Preparation",
        "In production",
        "Completed",
        "Cancelled",
      ]),
      type: name,
      manager: name,
      budget: amount,
      attendees: count,
      notes: text,
      timezone: name.refine((v) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: v });
          return true;
        } catch {
          return false;
        }
      }, "Invalid time zone"),
    })
    .strict()
    .refine((v) => v.endDate >= v.date, "Event end precedes start"),
  equipment: z
    .object({
      id: identifier,
      name,
      category: name,
      sku: name,
      quantity: count,
      maintenance: count,
      rate: amount,
      description: text,
    })
    .strict()
    .refine(
      (q) => q.maintenance <= q.quantity,
      "Maintenance exceeds owned stock",
    ),
  proposals: z
    .object({
      id: identifier,
      number: name,
      eventId: identifier,
      version: z.number().int().positive(),
      title: name,
      introduction: text,
      terms: text,
      lines: z.array(line).max(1000),
      discount: z.number().min(0).max(100),
      tax: z.number().min(0).max(100),
      status: z.enum([
        "Draft",
        "In review",
        "Ready to send",
        "Issued",
        "Accepted",
        "Declined",
        "Superseded",
      ]),
      validUntil: date,
      acceptedAt: z.string().datetime().optional(),
      aiReview: z
        .object({
          brief: text,
          assumptions: z.array(text).max(30),
          questions: z.array(text).max(150),
          generatedAt: z.string().datetime(),
          model: name,
        })
        .strict()
        .optional(),
    })
    .strict(),
  conversations: z
    .object({
      id: identifier,
      clientId: identifier,
      eventId: identifier,
      messages: z.array(message).max(10000),
      review: z.enum([
        "Pending",
        "Needs linking",
        "Confirmed",
        "Clarification needed",
        "Not accepted",
        "None",
      ]),
      proposalId: identifier.optional(),
      proposalVersion: z.number().int().positive().optional(),
      reviewMessageId: identifier.optional(),
      acceptanceEvidence: z
        .object({
          messageId: identifier,
          proposalId: identifier,
          proposalVersion: z.number().int().positive(),
          decidedAt: z.string().datetime(),
          ownerId: identifier.optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  tasks: z
    .object({
      id: identifier,
      eventId: identifier,
      title: name,
      assignee: name,
      assigneeId: identifier.optional(),
      role: name,
      date,
      done: z.boolean(),
      phase: z.enum(["Planning", "Preparation"]),
    })
    .strict(),
  reservations: z
    .object({
      id: identifier,
      eventId: identifier,
      equipmentId: identifier,
      quantity: count.min(1),
      start: date,
      end: date,
      status: z.enum([
        "Hold",
        "Confirmed",
        "Dispatched",
        "Returned",
        "Cancelled",
      ]),
    })
    .strict()
    .refine((v) => v.end >= v.start, "Return precedes preparation"),
  layouts: z
    .object({
      id: identifier,
      eventId: identifier,
      name,
      version: z.number().int().positive(),
      width: dimension,
      depth: dimension,
      objects: z.array(object).max(10000),
      verified: z.boolean(),
      verifiedAt: z.string().datetime().optional(),
      verificationNote: z.string().trim().max(1000).optional(),
      reference: layoutReference.optional(),
      history: z
        .array(
          z
            .object({
              version: z.number().int().positive(),
              objects: z.array(object).max(10000),
              savedAt: z.string().datetime(),
              width: dimension.optional(),
              depth: dimension.optional(),
              verified: z.boolean().optional(),
              verifiedAt: z.string().datetime().optional(),
              verificationNote: z.string().trim().max(1000).optional(),
            })
            .strict(),
        )
        .max(200),
    })
    .strict(),
  settings: z
    .object({
      company: name,
      currency: z.literal("USD"),
      timezone: name,
      email: z.union([z.email(), z.literal("")]),
      notifications: z.boolean(),
    })
    .strict(),
};
export const changeSchema = z
  .object({
    revision: z.number().int().nonnegative(),
    changes: z
      .array(
        z
          .object({
            collection: z.enum([
              "clients",
              "venues",
              "events",
              "equipment",
              "proposals",
              "conversations",
              "tasks",
              "reservations",
              "layouts",
              "settings",
            ]),
            id: identifier,
            value: z.unknown(),
          })
          .strict(),
      )
      .min(1)
      .max(200),
  })
  .strict();
export const userSchema = z
  .object({
    name,
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    role: z.enum(roles),
    eventIds: z.array(identifier).max(1000).default([]),
    clientId: identifier.optional(),
    sharedProposalIds: z.array(identifier).max(1000).default([]),
    password: z.string().min(12).max(256),
  })
  .strict();
export const setupSchema = z
  .object({
    name,
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(12).max(256),
    company: name,
  })
  .strict();
export const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(256),
  })
  .strict();
