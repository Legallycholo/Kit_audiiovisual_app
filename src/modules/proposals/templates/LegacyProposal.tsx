import { uiLabel } from "../../../shared/i18n";
import { Wordmark } from "../../../shared/ui";
import { money, shortDate } from "../../../shared/domain";
import type { ProposalDocumentData } from "./ProposalDocument";

/**
 * The earlier Minimal / Editorial / Spotlight presentation, kept so proposals
 * saved with those templates keep printing as they did. New proposals use
 * KIT Classic.
 */
export function LegacyProposal({ data }: { data: ProposalDocumentData }) {
  const { proposal, company, client, totals } = data;
  return (
    <div
      className={`print-proposal proposal-sheet-legacy template-${(proposal.presentationTemplate || "Editorial").toLowerCase()}`}
    >
      <header className="print-proposal-cover">
        <Wordmark size={30} className="document-wordmark" />
        <p>{company.company}</p>
        <h1>{proposal.title}</h1>
        <p>
          {proposal.number} · Versión {proposal.version} ·{" "}
          {uiLabel(proposal.status)}
        </p>
      </header>
      <hr />
      <h3>
        {uiLabel("Prepared for")} {client.name}
      </h3>
      <p>{proposal.introduction}</p>
      {(proposal.visuals || []).length > 0 && (
        <section className="print-visuals">
          <h2>Concepto visual</h2>
          {proposal.visualNarrative && <p>{proposal.visualNarrative}</p>}
          <div>
            {(proposal.visuals || []).map((visual) => (
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
          {proposal.lines.map((l) => (
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
        {proposal.tax > 0 && <p>Impuesto: {money(totals.tax)}</p>}
        <h2>Total: {money(totals.total)}</h2>
      </div>
      <h3>{uiLabel("Terms")}</h3>
      <p>{proposal.terms}</p>
      <p>
        {uiLabel("Valid until")}: {shortDate(proposal.validUntil)}
      </p>
    </div>
  );
}
