import type { Workspace } from "./types";

/** A workspace with no records; what a new company starts from. */
export function emptyWorkspace(company: string): Workspace {
  return {
    schema: 1,
    clients: [],
    venues: [],
    events: [],
    equipment: [],
    proposals: [],
    conversations: [],
    tasks: [],
    reservations: [],
    packages: [],
    maintenanceRecords: [],
    operations: [],
    automations: [],
    layouts: [],
    brandAssets: [],
    creativeAssets: [],
    activity: [],
    settings: {
      company,
      currency: "USD",
      timezone: "America/Puerto_Rico",
      email: "",
      notifications: true,
    },
  };
}
