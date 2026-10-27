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
      "Wall",
      "Door",
      "Window",
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
    surfaceColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    surfaceLabel: z.string().trim().max(200).optional(),
    source: z.enum(["Manual", "Extracted"]).optional(),
    confidence: z.number().finite().min(0).max(1).optional(),
    reviewStatus: z.enum(["Suggested", "Accepted", "Corrected"]).optional(),
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
    rightsConfirmed: z.boolean().optional(),
    uploadedAt: z.string().datetime().optional(),
    knownMeasurement: dimension.optional(),
    ceilingHeight: dimension.optional(),
    units: z.literal("meters").optional(),
  })
  .strict();
const sceneVector = z
  .object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
    z: z.number().finite().min(-100_000).max(100_000),
  })
  .strict();
const layoutCamera = z
  .object({
    id: identifier,
    name,
    position: sceneVector,
    target: sceneVector,
    createdAt: z.string().datetime(),
  })
  .strict();
const layoutCameraPath = z
  .object({
    cameraIds: z.array(identifier).min(2).max(50),
    durationSeconds: z.union([z.literal(15), z.literal(30), z.literal(60)]),
  })
  .strict();
const layoutProvenance = z
  .object({
    method: z.enum(["Manual", "Structured extraction"]),
    provider: name.optional(),
    model: name.optional(),
    requestId: identifier.optional(),
    extractedAt: z.string().datetime().optional(),
    reviewedAt: z.string().datetime().optional(),
    sourceName: name.optional(),
  })
  .strict();
const creativeKind = z.enum([
  "Event concept",
  "Stage concept",
  "Lighting concept",
  "Promotional visual",
  "Image edit",
]);
const brandAsset = z
  .object({
    id: identifier,
    eventId: identifier,
    name,
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    dataUrl: z
      .string()
      .max(1_500_000)
      .regex(/^data:image\/(png|jpeg|webp);base64,/),
    rightsConfirmed: z.literal(true),
    createdAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (value) => value.dataUrl.startsWith(`data:${value.mimeType};base64,`),
    "Brand reference MIME type does not match its data.",
  );
const creativeAsset = z
  .object({
    id: identifier,
    eventId: identifier,
    kind: creativeKind,
    title: name,
    brief: z.string().trim().min(20).max(20_000),
    revision: z.number().int().positive().max(1000),
    parentId: identifier.optional(),
    status: z.enum(["In review", "Approved", "Rejected"]),
    dataUrl: z
      .string()
      .max(1_500_000)
      .regex(/^data:image\/(svg\+xml(;charset=utf-8)?|png|jpeg|webp)[;,]/),
    mimeType: z.enum([
      "image/svg+xml",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]),
    referenceIds: z.array(identifier).max(20),
    provider: name,
    model: name,
    generatedAt: z.string().datetime(),
    usageUnits: z.number().int().positive().max(1000),
    estimatedCost: amount,
    reviewedAt: z.string().datetime().optional(),
    reviewNote: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (value) => value.dataUrl.startsWith(`data:${value.mimeType}`),
    "Creative asset MIME type does not match its data.",
  );
const proposalVisual = z
  .object({
    id: identifier,
    sourceType: z.enum(["Creative", "Layout plan", "Layout 3D"]),
    sourceId: identifier,
    sourceRevision: z.number().int().positive().max(1000),
    title: name,
    caption: z.string().trim().max(2000),
    altText: z.string().trim().min(1).max(500),
    dataUrl: z
      .string()
      .max(1_500_000)
      .regex(/^data:image\/(svg\+xml(;charset=utf-8)?|png|jpeg|webp)[;,]/),
    mimeType: z.enum([
      "image/svg+xml",
      "image/png",
      "image/jpeg",
      "image/webp",
    ]),
    measurementStatus: z.enum(["Verified", "Unverified"]).optional(),
    addedAt: z.string().datetime(),
  })
  .strict()
  .refine(
    (value) => value.dataUrl.startsWith(`data:${value.mimeType}`),
    "Proposal visual MIME type does not match its data.",
  );
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
      creativeAssetIds: z.array(identifier).max(50).optional(),
      presentationTemplate: z
        .enum(["Minimal", "Editorial", "Spotlight"])
        .optional(),
      visualNarrative: text.optional(),
      visuals: z.array(proposalVisual).max(12).optional(),
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
      source: z.enum(["Owned", "Supplier"]).optional(),
      supplier: z.string().trim().max(200).optional(),
      supplierReference: z.string().trim().max(200).optional(),
      unitCost: amount.optional(),
      bufferBeforeDays: z.number().int().min(0).max(30).optional(),
      bufferAfterDays: z.number().int().min(0).max(30).optional(),
      dispatchedQuantity: count.optional(),
      returnedQuantity: count.optional(),
      damagedQuantity: count.optional(),
      substituteEquipmentId: identifier.optional(),
      custodyNote: text.optional(),
    })
    .strict()
    .refine((v) => v.end >= v.start, "Return precedes preparation"),
  packages: z
    .object({
      id: identifier,
      name,
      description: text,
      active: z.boolean(),
      items: z
        .array(
          z
            .object({
              equipmentId: identifier,
              quantity: z.number().int().positive().max(1_000_000),
            })
            .strict(),
        )
        .min(1)
        .max(200),
    })
    .strict(),
  maintenanceRecords: z
    .object({
      id: identifier,
      equipmentId: identifier,
      reservationId: identifier.optional(),
      quantity: z.number().int().positive().max(1_000_000),
      issue: name,
      status: z.enum(["Open", "In repair", "Resolved"]),
      openedAt: z.string().datetime(),
      resolvedAt: z.string().datetime().optional(),
      cost: amount,
    })
    .strict(),
  operations: z
    .object({
      id: identifier,
      eventId: identifier,
      crewShifts: z
        .array(
          z
            .object({
              id: identifier,
              person: name,
              memberId: identifier.optional(),
              role: name,
              start: z.string().datetime(),
              end: z.string().datetime(),
              status: z.enum(["Scheduled", "Completed", "Cancelled"]),
              cost: amount,
            })
            .strict()
            .refine(
              (v) => v.end > v.start,
              "Crew shift must end after it starts",
            ),
        )
        .max(2000),
      cues: z
        .array(
          z
            .object({
              id: identifier,
              at: z.string().datetime(),
              title: name,
              department: name,
              owner: name,
              notes: text,
              status: z.enum(["Pending", "Complete", "Skipped"]),
            })
            .strict(),
        )
        .max(5000),
      transports: z
        .array(
          z
            .object({
              id: identifier,
              kind: z.enum(["Outbound", "Return"]),
              provider: name,
              vehicle: name,
              driver: name,
              departureAt: z.string().datetime(),
              arrivalAt: z.string().datetime(),
              status: z.enum([
                "Planned",
                "In transit",
                "Complete",
                "Cancelled",
              ]),
              cost: amount,
              notes: text,
            })
            .strict()
            .refine(
              (v) => v.arrivalAt > v.departureAt,
              "Transport must arrive after departure",
            ),
        )
        .max(1000),
      changes: z
        .array(
          z
            .object({
              id: identifier,
              title: name,
              detail: text,
              impact: text,
              recordedAt: z.string().datetime(),
              recordedBy: name,
              costImpact: amount,
            })
            .strict(),
        )
        .max(5000),
      costs: z
        .array(
          z
            .object({
              id: identifier,
              category: z.enum([
                "Crew",
                "Transport",
                "Supplier rental",
                "Repair",
                "Other",
              ]),
              description: name,
              amount,
              incurredAt: date,
            })
            .strict(),
        )
        .max(5000),
    })
    .strict(),
  automations: z
    .object({
      id: identifier,
      key: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .regex(/^[a-z0-9:_-]+$/),
      eventId: identifier.optional(),
      proposalId: identifier.optional(),
      kind: z.enum([
        "Proposal review",
        "Preparation risk",
        "Equipment return",
        "Cost variance",
      ]),
      title: name,
      detail: text,
      dueAt: z.string().datetime(),
      action: z.enum(["Create task", "Review only"]),
      status: z.enum(["Open", "Approved", "Dismissed", "Failed"]),
      createdAt: z.string().datetime(),
      decidedAt: z.string().datetime().optional(),
      decidedBy: name.optional(),
      taskId: identifier.optional(),
      failureReason: z.string().trim().min(1).max(2000).optional(),
    })
    .strict(),
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
      cameras: z.array(layoutCamera).max(50).optional(),
      cameraPath: layoutCameraPath.optional(),
      provenance: layoutProvenance.optional(),
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
              cameras: z.array(layoutCamera).max(50).optional(),
              cameraPath: layoutCameraPath.optional(),
              provenance: layoutProvenance.optional(),
            })
            .strict(),
        )
        .max(200),
    })
    .strict(),
  brandAssets: brandAsset,
  creativeAssets: creativeAsset,
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
              "packages",
              "maintenanceRecords",
              "operations",
              "automations",
              "layouts",
              "brandAssets",
              "creativeAssets",
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
export const accessSchema = z
  .object({
    role: z.enum(roles),
    eventIds: z.array(identifier).max(1000).default([]),
    clientId: identifier.optional(),
    sharedProposalIds: z.array(identifier).max(1000).default([]),
  })
  .strict();
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(256),
    newPassword: z.string().min(12).max(256),
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
    recaptchaToken: z.string().max(8192).optional(),
  })
  .strict();

export const firebaseLoginSchema = z
  .object({
    idToken: z.string().min(20).max(8192),
    recaptchaToken: z.string().max(8192).optional(),
  })
  .strict();
