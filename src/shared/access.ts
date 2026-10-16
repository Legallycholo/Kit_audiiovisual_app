import { sameValue } from "./value";
import type { Workspace } from "./types";

export const roles = [
  "Administrator",
  "Sales Manager",
  "Event Designer",
  "Production Manager",
  "Technician",
  "Client / Guest",
] as const;
export type Role = (typeof roles)[number];
export interface WorkspaceUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  isOwner: boolean;
  active: boolean;
  eventIds: string[];
  clientId?: string;
  sharedProposalIds: string[];
}
export type Collection = Exclude<
  keyof Workspace,
  "schema" | "activity" | "settings"
>;
export const collections: Collection[] = [
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
];
export interface WorkspaceChange {
  collection: Collection | "settings";
  id: string;
  value: unknown;
}
export interface WorkspaceResponse {
  workspace: Workspace;
  revision: number;
  user: WorkspaceUser;
}

export function canSeeModule(user: WorkspaceUser | null, path: string) {
  if (!user || user.role === "Administrator") return true;
  const module = path.split("/")[1];
  const access: Record<Role, string[]> = {
    Administrator: [],
    "Sales Manager": [
      "",
      "events",
      "clients",
      "venues",
      "proposals",
      "inbox",
      "inventory",
      "reports",
      "settings",
    ],
    "Event Designer": [
      "",
      "events",
      "clients",
      "venues",
      "design",
      "creative",
      "inventory",
      "production",
      "settings",
    ],
    "Production Manager": [
      "",
      "events",
      "clients",
      "venues",
      "design",
      "inventory",
      "production",
      "reports",
      "settings",
    ],
    Technician: [
      "",
      "events",
      "venues",
      "production",
      "inventory",
      "design",
      "settings",
    ],
    "Client / Guest": ["", "proposals", "settings"],
  };
  return access[user.role].includes(module);
}
export function canEditCollection(
  user: WorkspaceUser | null,
  collection: Collection | "settings",
) {
  if (!user || user.role === "Administrator") return true;
  const edit: Record<Role, string[]> = {
    Administrator: [],
    "Sales Manager": ["clients", "events", "proposals", "conversations"],
    "Event Designer": ["venues", "layouts", "brandAssets", "creativeAssets"],
    "Production Manager": [
      "events",
      "venues",
      "equipment",
      "reservations",
      "packages",
      "maintenanceRecords",
      "operations",
      "tasks",
      "layouts",
    ],
    Technician: ["tasks"],
    "Client / Guest": [],
  };
  return edit[user.role].includes(collection);
}
export function diffWorkspace(
  before: Workspace,
  after: Workspace,
): WorkspaceChange[] {
  const changes: WorkspaceChange[] = [];
  for (const collection of collections) {
    const original = new Map(before[collection].map((row) => [row.id, row]));
    if (
      before[collection].some(
        (row) => !after[collection].some((next) => next.id === row.id),
      )
    )
      throw new Error(
        "Records cannot be deleted. Use a supported archive or cancellation action.",
      );
    for (const row of after[collection])
      if (!sameValue(original.get(row.id), row))
        changes.push({ collection, id: row.id, value: row });
  }
  if (!sameValue(before.settings, after.settings))
    changes.push({
      collection: "settings",
      id: "company",
      value: after.settings,
    });
  // Audit history is always authored by the server, never by client-supplied entries.
  return changes;
}
