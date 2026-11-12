import { uiLabel } from "../../shared/i18n";
import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { Badge, Button, Field, Modal } from "../../shared/ui";
import { money } from "../../shared/domain";
import { longDate } from "./templates/ProposalDocument";
import type { EditorView } from "./editor-view";

/** Review-and-send, version comparison and the version list. */
export function EditorDialogs({ ctx }: { ctx: EditorView }) {
  const {
    draft,
    sending,
    setSending,
    outgoingMessage,
    setOutgoingMessage,
    compareOpen,
    setCompareOpen,
    setCompareId,
    versionsOpen,
    setVersionsOpen,
    client,
    family,
    priorVersions,
    comparison,
    totals,
    comparisonTotal,
    prepareOutgoingMessage,
  } = ctx;
  return (
    <>
      {sending && (
        <Modal
          title={uiLabel("Owner review · outgoing proposal")}
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
              <Send size={20} aria-hidden="true" />
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
      {versionsOpen && (
        <Modal
          title="Versiones"
          description={`${draft.number} · cada versión enviada se conserva tal cual`}
          onClose={() => setVersionsOpen(false)}
        >
          <div className="modal-body">
            <ol className="proposal-version-list">
              {family.map((version) => (
                <li
                  key={version.id}
                  className={version.id === draft.id ? "current" : ""}
                >
                  <span>
                    <strong>v{version.version}</strong>
                    <small>
                      {version.updatedAt
                        ? longDate(version.updatedAt.slice(0, 10))
                        : version.acceptedAt
                          ? longDate(version.acceptedAt.slice(0, 10))
                          : "—"}
                    </small>
                  </span>
                  <Badge>{version.status}</Badge>
                  {version.id === draft.id ? (
                    <em>Abierta</em>
                  ) : (
                    <Link
                      to={`/proposals/${version.id}`}
                      onClick={() => setVersionsOpen(false)}
                    >
                      Abrir
                    </Link>
                  )}
                </li>
              ))}
            </ol>
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
    </>
  );
}
