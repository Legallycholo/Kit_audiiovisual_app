// Portal interface text (Spanish). Business content is never translated.
export const es = {
  brand: "KIT audiovisual",
  nav: {
    users: "Usuarios",
    workspace: "Espacio de trabajo",
    signOut: "Cerrar sesión",
    mainNav: "Navegación principal",
  },
  roles: { user: "Usuario", admin: "Administrador" },
  accountStatus: {
    active: "Activa",
    pending: "Pendiente",
    rejected: "Rechazada",
    banned: "Bloqueada",
    deleted: "Eliminada",
  },
  common: {
    loading: "Cargando…",
    cancel: "Cancelar",
    confirm: "Confirmar",
    save: "Guardar cambios",
    back: "Volver",
    reason: "Motivo",
    optional: "opcional",
    empty: "Sin resultados",
    retry: "Reintentar",
  },
  errors: {
    generic: "No se pudo completar la acción. Inténtalo de nuevo.",
    network: "No se pudo conectar con el servidor.",
    not_configured:
      "El portal no está configurado. Faltan las claves de Supabase en el servidor.",
    last_admin: "No puedes quitar al último administrador.",
    cannot_change_self: "No puedes cambiar el estado de tu propia cuenta.",
    forbidden: "No tienes permiso para hacer esto.",
    invalid_credentials: "Correo o contraseña incorrectos.",
    email_not_confirmed: "Confirma tu correo antes de iniciar sesión.",
    weak_password:
      "La contraseña es demasiado débil. Usa al menos 8 caracteres.",
    over_request_rate_limit:
      "Demasiados intentos. Espera un momento e inténtalo de nuevo.",
  } as Record<string, string>,
};

/** Maps a Supabase/RPC error to Spanish copy. */
export function errorMessage(error: unknown): string {
  const e = error as { message?: string; code?: string } | null;
  const key = e?.code && es.errors[e.code] ? e.code : (e?.message ?? "");
  if (es.errors[key]) return es.errors[key];
  const lower = (e?.message ?? "").toLowerCase();
  if (lower.includes("invalid login")) return es.errors.invalid_credentials;
  if (lower.includes("failed to fetch")) return es.errors.network;
  return es.errors.generic;
}

export const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("es-MX", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
