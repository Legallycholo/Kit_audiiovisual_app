import { useEffect, useState } from "react";
import { AlertCircle, History, Sparkles } from "lucide-react";
import { useWorkspace } from "../shared/store";
import { Button, ErrorNote, Field, LightMix } from "../shared/ui";
import type { Proposal } from "../shared/types";
import { ConnectNotice } from "./ConnectNotice";
export type DraftSuggestion = Pick<
  Proposal,
  "title" | "introduction" | "lines" | "aiReview"
>;
export function ProposalAI({
  eventId,
  existing,
  onApply,
}: {
  eventId: string;
  existing?: Proposal;
  onApply: (suggestion: DraftSuggestion) => void | Promise<void>;
}) {
  const { data, mode, request, openCompany, refresh } = useWorkspace();
  const [brief, setBrief] = useState(existing?.aiReview?.brief || "");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<DraftSuggestion | null>(null);
  const [replaceText, setReplaceText] = useState(!existing);
  const [replaceLines, setReplaceLines] = useState(!existing);
  const event = data.events.find((item) => item.id === eventId);
  const client = data.clients.find((item) => item.id === event?.clientId);
  const missingInformation = [
    ...(!client ? ["Vincula un cliente válido al evento."] : []),
    ...(!event?.date || !event?.endDate
      ? ["Confirma las fechas de inicio y finalización."]
      : []),
    ...(!event?.type.trim() ? ["Indica el tipo de evento."] : []),
    ...(!event?.notes.trim()
      ? ["Agrega requisitos o notas operativas al evento."]
      : []),
    ...(!event?.attendees || event.attendees < 1
      ? ["Confirma la cantidad estimada de asistentes."]
      : []),
    ...(data.equipment.length === 0
      ? ["Agrega equipos y tarifas al catálogo."]
      : []),
    ...(data.equipment.some((item) => item.rate === 0)
      ? ["Hay equipos con tarifa cero; revisa cualquier partida seleccionada."]
      : []),
    ...(brief.trim().length < 10
      ? ["Describe el alcance solicitado con al menos 10 caracteres."]
      : []),
  ];
  const history = data.activity
    .filter(
      (item) =>
        item.eventId === eventId &&
        item.title === "AI proposal suggestion generated",
    )
    .slice(0, 5);
  useEffect(() => {
    let active = true;
    if (mode === "company")
      request<{ configured: boolean }>("/ai/status")
        .then((result) => {
          if (active) setConfigured(result.configured);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [mode, request]);
  useEffect(() => {
    setSuggestion(null);
  }, [eventId]);
  if (mode === "sample")
    return (
      <div className="connection-note">
        <Sparkles size={21} />
        <div>
          <strong>La IA requiere el espacio de tu empresa</strong>
          <p>
            Los ejemplos permanecen separados de tus datos. Puedes comenzar con
            un borrador manual.
          </p>
          <Button variant="secondary" onClick={openCompany}>
            Abrir espacio de empresa
          </Button>
        </div>
      </div>
    );
  return (
    <div className="ai-draft-panel">
      <Field
        label="¿Qué debe incluir la propuesta?"
        hint="Describe equipos, duración, servicios y requisitos. Puedes continuar editando aunque la IA no esté disponible."
      >
        <textarea
          rows={5}
          maxLength={6000}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          disabled={busy}
        />
      </Field>
      <p className="muted">
        La IA recibirá esta descripción, el resumen del evento, el nombre del
        cliente y el catálogo de equipos y tarifas. Revisa la sugerencia antes
        de aplicarla.
      </p>
      {missingInformation.length > 0 && (
        <section
          className="ai-readiness"
          aria-label="Información por confirmar"
        >
          <div>
            <AlertCircle size={18} />
            <strong>Información por confirmar</strong>
          </div>
          <ul>
            {missingInformation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p>
            Puedes generar un alcance preliminar. Estas advertencias deben
            revisarse antes de enviar la propuesta.
          </p>
        </section>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {configured === false && <ConnectNotice service="ai" compact />}
      <Button
        disabled={busy || !configured || !eventId || brief.trim().length < 10}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const result = await request<{ suggestion: DraftSuggestion }>(
              "/ai/proposal-draft",
              { method: "POST", body: { eventId, brief } },
            );
            setSuggestion(result.suggestion);
            await refresh();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={16} />
        {busy
          ? "Preparando sugerencia…"
          : suggestion
            ? "Generar otra sugerencia"
            : "Generar sugerencia"}
      </Button>
      {busy && (
        <div className="ai-thinking">
          <LightMix showLabel label="KIT está preparando el borrador…" />
          <p className="muted">Tu propuesta actual permanece intacta.</p>
        </div>
      )}
      {suggestion && (
        <section className="ai-suggestion" aria-label="Sugerencia de propuesta">
          <h3>{suggestion.title}</h3>
          <p className="preserve-lines">{suggestion.introduction}</p>
          <h4>Equipos sugeridos</h4>
          <ul>
            {suggestion.lines.map((line) => (
              <li key={line.id}>
                {line.description} · {line.quantity} unidades · {line.days} días
              </li>
            ))}
          </ul>
          <p>
            Las tarifas provienen del catálogo. La disponibilidad y los términos
            requieren revisión.
          </p>
          <AIReview review={suggestion.aiReview} />
          {existing && (
            <fieldset className="assignment-fieldset">
              <legend>Elige qué reemplazar en el borrador actual</legend>
              <label>
                <input
                  type="checkbox"
                  checked={replaceText}
                  onChange={(e) => setReplaceText(e.target.checked)}
                />
                Reemplazar título e introducción
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={replaceLines}
                  onChange={(e) => setReplaceLines(e.target.checked)}
                />
                Reemplazar la lista de equipos y servicios
              </label>
              <p>
                Los términos, impuestos y descuentos se conservan. Tus cambios
                no se guardan hasta que pulses Guardar cambios.
              </p>
            </fieldset>
          )}
          <Button
            disabled={
              busy || (Boolean(existing) && !replaceText && !replaceLines)
            }
            onClick={async () => {
              setBusy(true);
              try {
                await onApply({
                  ...suggestion,
                  ...(existing && !replaceText
                    ? {
                        title: existing.title,
                        introduction: existing.introduction,
                      }
                    : {}),
                  ...(existing && !replaceLines
                    ? { lines: existing.lines }
                    : {}),
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            {existing
              ? "Aplicar selección al borrador"
              : "Crear propuesta con esta sugerencia"}
          </Button>
        </section>
      )}
      {history.length > 0 && (
        <section className="ai-history" aria-label="Historial de generación">
          <div>
            <History size={17} />
            <strong>Historial de generación</strong>
          </div>
          <ul>
            {history.map((item) => (
              <li key={item.id}>
                <time dateTime={item.at}>{formatAIStamp(item.at)}</time>
                <span>{item.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
export function AIReview({ review }: { review: Proposal["aiReview"] }) {
  if (!review) return null;
  return (
    <aside className="ai-review">
      <strong>Revisión interna del borrador de IA</strong>
      <p>Estas notas no aparecen en la vista para el cliente.</p>
      <p className="ai-provenance">
        Generada por IA el {formatAIStamp(review.generatedAt)} con el modelo{" "}
        <strong>{review.model}</strong>. Las tarifas se copiaron del catálogo al
        crear la sugerencia.
      </p>
      <details>
        <summary>Descripción utilizada para generar</summary>
        <p className="preserve-lines">{review.brief}</p>
      </details>
      {review.assumptions.length > 0 && (
        <>
          <h4>Suposiciones por verificar</h4>
          <ul>
            {review.assumptions.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </>
      )}
      {review.questions.length > 0 && (
        <>
          <h4>Información pendiente</h4>
          <ul>
            {review.questions.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

function formatAIStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("es-PR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
