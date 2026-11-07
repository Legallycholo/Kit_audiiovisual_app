import { createClient } from "@supabase/supabase-js";

// Public values only. The secret key never reaches the browser (see vite.config.ts).
const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabaseConfigured = Boolean(url && key);

export const supabase = createClient(
  url || "http://localhost:54321",
  key || "not-configured",
  { auth: { persistSession: true, autoRefreshToken: true } },
);

export type AppRole = "user" | "admin";
export type AccountStatus =
  "active" | "pending" | "rejected" | "banned" | "deleted";
export interface Profile {
  id: string;
  email: string | null;
  role: AppRole;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  locale: string;
  account_status: AccountStatus;
  status_reason: string | null;
  created_at: string;
}
