import { useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowUp, History, Sparkles, X } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { Button, ErrorNote, LightMix } from "../../shared/ui";
import type { Proposal } from "../../shared/types";
import { money, quoteTotals } from "../../shared/domain";
import { ConnectNotice } from "../ConnectNotice";

/** What the server returns after validating the model's output (rates from the catalog only). */
export type DraftSuggestion = Pick<
  Proposal,
  "title" | "introduction" | "lines"
> & {
  aiReview: NonNullable<Proposal["aiReview"]>;
} & Partial<Pick<Proposal, "scope" | "notes" | "terms" | "discount">>;

const examples = [
  "Proyección para una actividad de 200 personas con proyector BARCO, computadora, técnicos, entrega y cableado.",
  "Añade dos técnicos de montaje y el servicio de entrega.",
  "Reescribe la introducción con un tono más premium, en dos párrafos.",
  "Cambia el descuento a 10 %.",
  "¿Qué información falta para enviar esta propuesta?",
];

export interface SuggestionChange {
  kind: "text" | "line" | "money";
  symbol: "+" | "−" | "~";
  label: string;
}

/** The differences a suggestion would make to the current draft, for review. */
export function describeChanges(
  draft: Proposal,
  suggestion: DraftSuggestion,
): SuggestionChange[] {
  const changes: SuggestionChange[] = [];
  const textFields: [keyof Proposal, string][] = [
    ["title", "título"],
    ["introduction", "introducción"],
    ["scope", "trabajo"],
    ["notes", "notas"],
    ["terms", "términos"],
  ];
  for (const [key, label] of textFields) {
    const next = suggestion[key as keyof DraftSuggestion] as string | undefined;
    if (next === undefined) continue;
    const current = (draft[key] as string | undefined) ?? "";
    if (next.trim() !== current.trim())
      changes.push({
        kind: "text",
        symbol: current.trim() ? "~" : "+",
        label: current.trim() ? `Actualizar ${label}` : `Añadir ${label}`,
      });
  }
  const describe = (line: Proposal["lines"][number]) =>
    `${line.quantity} × ${line.description}${line.days > 1 ? ` · ${line.days} días` : ""}`;
  const keyOf = (line: Proposal["lines"][number]) =>
    line.equipmentId || `custom:${line.description.trim().toLowerCase()}`;
  const current = new Map(draft.lines.map((line) => [keyOf(line), line]));
  const next = new Map(suggestion.lines.map((line) => [keyOf(line), line]));
  for (const [key, line] of next) {
    const before = current.get(key);
    if (!before)
      changes.push({
        kind: "line",
        symbol: "+",
        label: `Añadir ${describe(line)}`,
      });
    else if (before.quantity !== line.quantity || before.days !== line.days)
      changes.push({
        kind: "line",
        symbol: "~",
        label: `${line.description}: ${before.quantity} × ${before.days} días → ${line.quantity} × ${line.days} días`,
      });
  }
  for (const [key, line] of current)
    if (!next.has(key))
      changes.push({
        kind: "line",
        symbol: "−",
        label: `Quitar ${describe(line)}`,
      });
  if (
    suggestion.discount !== undefined &&
    suggestion.discount !== draft.discount
  )
    changes.push({
      kind: "money",
      symbol: "~",
      label: `Cambiar descuento de ${draft.discount}% → ${suggestion.discount}%`,
    });
  return changes;
}

/**
 * KIT for proposals: one composer, structured suggestions, explicit review.
 * The model never writes the document; the person applies reviewed changes,
 * and any change to lines or money needs a confirmation first.
 */
export function ProposalAssistant({
  draft,
  locked,
  onApply,
  onClose,
}: {
  draft: Proposal;
  locked: boolean;
  onApply: (
    suggestion: DraftSuggestion,
    options: { text: boolean; lines: boolean; money: boolean },
  ) => void;
  onClose?: () => void;
}) {
  const { data, request, refresh } = useWorkspace();
  const [brief, setBrief] = useState("");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [suggestion, setSuggestion] = useState<DraftSuggestion | null>(null);
  const [confirmMoney, setConfirmMoney] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const event = data.events.find((item) => item.id === draft.eventId);
  const history = data.activity
    .filter(
      (item) =>
        (draft.eventId ? item.eventId === draft.eventId : !item.eventId) &&
        item.title === "AI proposal suggestion generated",
    )
    .slice(0, 5);
  const missing = [
    ...(!draft.eventId
      ? ["Vincula un evento para que KIT conozca fechas y cliente."]
      : []),
    ...(event && !event.notes.trim()
      ? ["El evento no tiene notas: describe los requisitos aquí."]
      : []),
    ...(data.equipment.length === 0
      ? [
          "El catálogo de equipos está vacío; KIT solo cotiza con tarifas del catálogo.",
        ]
      : []),
  ];
  useEffect(() => {
    let active = true;
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
  }, [request]);
  useEffect(() => {
    setSuggestion(null);
    setConfirmMoney(false);
  }, [draft.id]);
  const changes = suggestion ? describeChanges(draft, suggestion) : [];
  const financial = changes.some((c) => c.kind !== "text");
  const canSend =
    !busy && configured === true && !locked && brief.trim().length >= 10;
  const generate = async () => {
    setBusy(true);
    setError("");
    setConfirmMoney(false);
    try {
      const result = await request<{ suggestion: DraftSuggestion }>(
        "/ai/proposal-draft",
        { method: "POST", body: { proposalId: draft.id, brief: brief.trim() } },
      );
      setSuggestion(result.suggestion);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  let suggestedTotal = 0;
  if (suggestion)
    try {
      suggestedTotal = quoteTotals(
        suggestion.lines,
        suggestion.discount ?? draft.discount,
        draft.tax,
      ).total;
    } catch {
      /* Shown as 0 until the person fixes the numbers. */
    }
  return (
    <aside className="proposal-assistant" aria-label="KIT para esta propuesta">
      <header className="proposal-assistant-head">
        <span className="proposal-assistant-title">
          <Sparkles size={16} aria-hidden="true" />
          KIT
        </span>
        {onClose && (
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar KIT"
            onClick={onClose}
          >
            <X size={18} aria-hidden="true" />
          </button>
        )}
      </header>
      <div className="proposal-assistant-body">
        {configured === false && <ConnectNotice service="ai" compact />}
        {locked && (
          <p className="muted">
            Esta versión es un registro. Crea una nueva versión para que KIT
            proponga cambios.
          </p>
        )}
        {!suggestion && !busy && (
          <div className="proposal-assistant-intro">
            <h3>¿Qué quieres preparar?</h3>
            <p className="muted">
              Describe lo que necesita el cliente o pide un cambio. KIT propone
              contenido y partidas con tarifas del catálogo; tú revisas y
              aplicas.
            </p>
            <ul className="proposal-assistant-examples">
              {examples.map((text) => (
                <li key={text}>
                  <button
                    type="button"
                    onClick={() => {
                      setBrief(text);
                      editor.current?.focus();
                    }}
                  >
                    {text}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {missing.length > 0 && !locked && (
          <section
            className="ai-readiness"
            aria-label="Información por confirmar"
          >
            <div>
              <AlertCircle size={16} aria-hidden="true" />
              <strong>Antes de generar</strong>
            </div>
            <ul>
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        {busy && (
          <div className="ai-thinking">
            <LightMix showLabel label="KIT está preparando la propuesta…" />
            <p className="muted">Tu documento no cambia hasta que apliques.</p>
          </div>
        )}
        {suggestion && !busy && (
          <section
            className="ai-suggestion"
            aria-label="Sugerencia de propuesta"
          >
            <h3>KIT propone</h3>
            {changes.length ? (
              <ul className="proposal-change-list">
                {changes.map((change) => (
                  <li key={change.label} className={`change-${change.kind}`}>
                    <span className="change-symbol" aria-hidden="true">
                      {change.symbol}
                    </span>
                    {change.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">Sin cambios respecto al documento actual.</p>
            )}
            {financial && (
              <p className="proposal-change-total">
                Total propuesto: <strong>{money(suggestedTotal)}</strong>
              </p>
            )}
            <AIReview review={suggestion.aiReview} />
            {financial && (
              <label className="proposal-change-confirm">
                <input
                  type="checkbox"
                  checked={confirmMoney}
                  onChange={(e) => setConfirmMoney(e.target.checked)}
                />{" "}
                Confirmo los cambios de partidas, cantidades o descuento. Las
                tarifas vienen del catálogo; los servicios sin precio quedan en
                $0 hasta que lo indique.
              </label>
            )}
            <div className="proposal-change-actions">
              <Button
                disabled={
                  locked || (financial && !confirmMoney) || !changes.length
                }
                onClick={() => {
                  onApply(suggestion, { text: true, lines: true, money: true });
                  setSuggestion(null);
                  setBrief("");
                }}
              >
                Aplicar cambios
              </Button>
              <Button variant="secondary" onClick={() => setSuggestion(null)}>
                Descartar
              </Button>
            </div>
          </section>
        )}
        {history.length > 0 && (
          <section className="ai-history" aria-label="Historial de generación">
            <div>
              <History size={15} aria-hidden="true" />
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
      <form
        className="kit-composer proposal-composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (canSend) void generate();
        }}
      >
        <label className="kit-editor">
          <span className="visually-hidden">
            ¿Qué debe incluir la propuesta?
          </span>
          <textarea
            ref={editor}
            rows={2}
            maxLength={6000}
            placeholder="Describe la propuesta o pide un cambio…"
            value={brief}
            disabled={busy || locked}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                if (canSend) e.currentTarget.form?.requestSubmit();
              }
            }}
          />
        </label>
        <div className="kit-composer-bar">
          <span className="muted tiny">
            {configured === false
              ? "Sin proveedor de IA conectado."
              : "KIT sugiere; tú apruebas. Nunca inventa precios."}
          </span>
          <button
            className="kit-send"
            disabled={!canSend}
            aria-label="Generar sugerencia"
            title="Generar sugerencia"
          >
            <ArrowUp size={18} aria-hidden="true" />
          </button>
        </div>
      </form>
    </aside>
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
