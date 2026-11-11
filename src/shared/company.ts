import type { Workspace } from "./types";

/**
 * KIT Audiovisual's own identity, as printed on its documents (confirmed by the
 * owner on 2026-11-11). These are the defaults for the company settings; the
 * owner edits them in Configuración › General and proposals read them from
 * `workspace.settings`, never from here directly.
 */
export const kitCompanyProfile = {
  company: "KIT Audiovisual",
  slogan: "La gente de los eventos",
  address: "Calle 3 SE Urb. La Riviera #982, San Juan, PR 00921",
  phone: "787-436-8556",
  email: "kitaudiovisual@hotmail.com",
  website: "",
} as const;

export type CompanySettings = Workspace["settings"];

/** Fills the brand fields that older workspaces (and the live one) lack. */
export function withCompanyDefaults(
  settings: Partial<CompanySettings> & { company: string },
): CompanySettings {
  return {
    company: settings.company,
    currency: settings.currency ?? "USD",
    timezone: settings.timezone ?? "America/Puerto_Rico",
    email: settings.email ?? "",
    notifications: settings.notifications ?? true,
    slogan: settings.slogan ?? kitCompanyProfile.slogan,
    address: settings.address ?? kitCompanyProfile.address,
    phone: settings.phone ?? kitCompanyProfile.phone,
    website: settings.website ?? kitCompanyProfile.website,
  };
}
