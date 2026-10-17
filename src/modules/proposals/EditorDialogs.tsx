import { uiLabel } from "../../shared/i18n";
import { ProposalAI } from "../ProposalAI";
import { Send, Printer } from "lucide-react";
import { Button, Field, Modal } from "../../shared/ui";
import { money, shortDate } from "../../shared/domain";
import type { Proposal } from "../../shared/types";
import type { EditorView } from "./editor-view";

export function EditorDialogs({ ctx }: { ctx: EditorView }) {
  const {
    data,
    mode,
    draft,
    setDraft,
    preview,
    setPreview,
    sending,
    setSending,
    outgoingMessage,
    setOutgoingMessage,
    aiOpen,
    setAiOpen,
    compareOpen,
    setCompareOpen,
    setCompareId,
    section,
    event,
    client,
    priorVersions,
    comparison,
    totals,
    comparisonTotal,
    prepareOutgoingMessage,
  } = ctx;
  return (
    <>
      {aiOpen && (
        <Modal
          wide
          title="Mejorar propuesta con IA"
          description="Genera y revisa una sugerencia antes de reemplazar contenido."
          onClose={() => setAiOpen(false)}
        >
          <div className="modal-body">
            <ProposalAI
              eventId={draft.eventId}
              existing={draft}
              onApply={(suggestion) => {
                setDraft({ ...draft, ...suggestion, status: "Draft" });
                setAiOpen(false);
              }}
            />
          </div>
        </Modal>
      )}
      {sending && (
        <Modal
          title={uiLabel("Owner review \u00B7 outgoing proposal")}
          description={uiLabel(
            "Every client message requires your confirmation.",
          )}
          onClose={() => setSending(false)}
        >
          <div className="modal-body">
            <div className="detail-facts">
              <div>
                <span>{uiLabel("Recipient")}</span>
                <strong>
                  {client?.contact} · {client?.phone}
                </strong>
              </div>
              <div>
                <span>{uiLabel("Exact revision")}</span>
                <strong>
                  {draft.number} · v{draft.version}
                </strong>
              </div>
              <div>
                <span>{uiLabel("Total")}</span>
                <strong>{money(totals.total)}</strong>
              </div>
            </div>
            <Field label={uiLabel("Message to client")}>
              <textarea
                rows={4}
                value={outgoingMessage}
                onChange={(event) => setOutgoingMessage(event.target.value)}
              />
            </Field>
            <div className="connection-note">
              <Send size={20} />
              <div>
                <strong>Revisión antes del envío</strong>
                <p>
                  El mensaje se guardará con esta versión exacta y se abrirá en
                  Mensajes de clientes. El envío requiere una segunda
                  confirmación del propietario.
                </p>
              </div>
            </div>
            <Button
              disabled={!outgoingMessage.trim()}
              onClick={prepareOutgoingMessage}
            >
              Preparar en mensajes
            </Button>
          </div>
        </Modal>
      )}
      {compareOpen && comparison && (
        <Modal
          wide
          title="Comparar versiones"
          description={`${draft.number} · la comparación no modifica ninguna versión`}
          onClose={() => setCompareOpen(false)}
        >
          <div className="modal-body revision-comparison">
            <Field label="Versión anterior">
              <select
                value={comparison.id}
                onChange={(event) => setCompareId(event.target.value)}
              >
                {priorVersions.map((proposal) => (
                  <option value={proposal.id} key={proposal.id}>
                    Versión {proposal.version} · {uiLabel(proposal.status)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="revision-comparison-grid">
              <div>
                <span>Versión {comparison.version}</span>
                <strong>{comparison.title}</strong>
                <small>{uiLabel(comparison.status)}</small>
              </div>
              <div>
                <span>Versión {draft.version}</span>
                <strong>{draft.title}</strong>
                <small>{uiLabel(draft.status)}</small>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Elemento</th>
                  <th>Versión {comparison.version}</th>
                  <th>Versión {draft.version}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Total</td>
                  <td>{money(comparisonTotal)}</td>
                  <td>{money(totals.total)}</td>
                </tr>
                <tr>
                  <td>Partidas</td>
                  <td>{comparison.lines.length}</td>
                  <td>{draft.lines.length}</td>
                </tr>
                <tr>
                  <td>Descuento / impuesto</td>
                  <td>
                    {comparison.discount}% / {comparison.tax}%
                  </td>
                  <td>
                    {draft.discount}% / {draft.tax}%
                  </td>
                </tr>
                <tr>
                  <td>Recursos visuales</td>
                  <td>{comparison.visuals?.length || 0}</td>
                  <td>{draft.visuals?.length || 0}</td>
                </tr>
              </tbody>
            </table>
            <div className="revision-change-list">
              <strong>Cambios de alcance visibles</strong>
              {draft.lines
                .filter(
                  (line) =>
                    !comparison.lines.some(
                      (previous) => previous.description === line.description,
                    ),
                )
                .map((line) => (
                  <span key={line.id}>+ {line.description}</span>
                ))}
              {comparison.lines
                .filter(
                  (line) =>
                    !draft.lines.some(
                      (current) => current.description === line.description,
                    ),
                )
                .map((line) => (
                  <span key={line.id}>− {line.description}</span>
                ))}
              {draft.visuals
                ?.filter(
                  (visual) =>
                    !comparison.visuals?.some(
                      (previous) =>
                        previous.sourceType === visual.sourceType &&
                        previous.sourceId === visual.sourceId &&
                        previous.sourceRevision === visual.sourceRevision,
                    ),
                )
                .map((visual) => (
                  <span key={visual.id}>+ {visual.title}</span>
                ))}
              {draft.lines.length === comparison.lines.length &&
                (draft.visuals?.length || 0) ===
                  (comparison.visuals?.length || 0) && (
                  <small>
                    Revisa también los cambios de texto, cantidades y precios
                    mostrados arriba.
                  </small>
                )}
            </div>
          </div>
        </Modal>
      )}
      {preview && (
        <Modal
          title={uiLabel("Proposal preview")}
          description={uiLabel(
            "Print this review copy or save it as a PDF using your browser.",
          )}
          onClose={() => setPreview(false)}
          wide
        >
          <div
            className={`print-proposal template-${(draft.presentationTemplate || "Editorial").toLowerCase()}`}
          >
            <header className="print-proposal-cover">
              <span className="brand-small">kit.</span>
              <p>{data.settings.company}</p>
              <h1>{draft.title}</h1>
              <p>
                {draft.number} · Versión {draft.version} ·{" "}
                {uiLabel(draft.status)}
              </p>
            </header>
            <hr />
            <h3>
              {uiLabel("Prepared for")} {client?.name}
            </h3>
            <p>{draft.introduction}</p>
            {(draft.visuals || []).length > 0 && (
              <section className="print-visuals">
                <h2>Concepto visual</h2>
                {draft.visualNarrative && <p>{draft.visualNarrative}</p>}
                <div>
                  {(draft.visuals || []).map((visual) => (
                    <figure key={visual.id}>
                      <img src={visual.dataUrl} alt={visual.altText} />
                      <figcaption>
                        <strong>{visual.title}</strong>
                        <span>{visual.caption}</span>
                        {visual.measurementStatus === "Unverified" && (
                          <small>Medidas no verificadas</small>
                        )}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}
            <table>
              <thead>
                <tr>
                  <th>{uiLabel("Description")}</th>
                  <th>{uiLabel("Qty")}</th>
                  <th>{uiLabel("Days")}</th>
                  <th>{uiLabel("Rate")}</th>
                  <th>{uiLabel("Total")}</th>
                </tr>
              </thead>
              <tbody>
                {draft.lines.map((l) => (
                  <tr key={l.id}>
                    <td>{l.description}</td>
                    <td>{l.quantity}</td>
                    <td>{l.days}</td>
                    <td>{money(l.rate)}</td>
                    <td>{money(l.quantity * l.rate * l.days)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="print-totals">
              <p>Subtotal: {money(totals.subtotal)}</p>
              <p>Descuento: −{money(totals.discount)}</p>
              <p>Impuesto: {money(totals.tax)}</p>
              <h2>Total: {money(totals.total)}</h2>
            </div>
            <h3>{uiLabel("Terms")}</h3>
            <p>{draft.terms}</p>
            <p>
              {uiLabel("Valid until")}: {shortDate(draft.validUntil)}
            </p>
            <p className="tiny">
              {mode === "sample"
                ? "Datos de ejemplo · copia de revisión"
                : "Copia de revisión"}
            </p>
          </div>
          <div className="modal-actions no-print">
            <Button onClick={() => window.print()}>
              <Printer size={16} />
              {uiLabel("Print / save PDF")}
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
