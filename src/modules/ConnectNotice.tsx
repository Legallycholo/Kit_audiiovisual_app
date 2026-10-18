import { Link } from "react-router-dom";
import { MessageCircle, ScanLine, Sparkles } from "lucide-react";
import { useWorkspace } from "../shared/store";
import { uiLabel } from "../shared/i18n";

const copy = {
  ai: {
    icon: <Sparkles size={20} />,
    title: "La IA no está conectada.",
    text: "Puedes trabajar manualmente.",
  },
  kit: {
    icon: <Sparkles size={20} />,
    title: "Conecta un proveedor de IA",
    text: "KIT responde cuando el servidor de empresa tiene una clave de IA. Tus conversaciones anteriores siguen disponibles.",
  },
  whatsapp: {
    icon: <MessageCircle size={20} />,
    title: "Conecta WhatsApp para enviar y recibir",
    text: "Puedes escribir y guardar borradores; se envían cuando el canal esté conectado y los confirmes.",
  },
  plan: {
    icon: <ScanLine size={20} />,
    title: "La lectura automática de planos no está conectada.",
    text: "Puedes trazar paredes, puertas y ventanas a mano sobre la imagen de referencia.",
  },
} as const;

/**
 * Shown when a service has no key on the server. The work stays possible by
 * hand; only the owner gets the link to Settings › Integraciones.
 */
export function ConnectNotice({
  service,
  compact = false,
}: {
  service: keyof typeof copy;
  compact?: boolean;
}) {
  const { user } = useWorkspace();
  const item = copy[service];
  return (
    <div className={`connect-notice ${compact ? "compact" : ""}`} role="note">
      <span className="connect-notice-icon" aria-hidden="true">
        {item.icon}
      </span>
      <div>
        <strong>{uiLabel(item.title)}</strong>
        <p>{uiLabel(item.text)}</p>
      </div>
      {user?.isOwner ? (
        <Link className="button secondary" to="/settings/integrations">
          {uiLabel("Conectar en Integraciones")}
        </Link>
      ) : (
        <small>{uiLabel("Ask the owner to connect it.")}</small>
      )}
    </div>
  );
}
