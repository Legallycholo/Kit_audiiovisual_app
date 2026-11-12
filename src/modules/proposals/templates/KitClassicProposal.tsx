import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import type { Equipment, Proposal, QuoteLine } from "../../../shared/types";
import { money } from "../../../shared/domain";
import { Wordmark } from "../../../shared/ui";
import { visualSrc } from "../../../shared/proposal-visuals";
import {
  DocCell,
  DocText,
  longDate,
  type ProposalDocumentData,
} from "./ProposalDocument";

/** The edit handlers; absent in preview and print. */
export interface ProposalEditHandlers {
  patch: (values: Partial<Proposal>) => void;
  setClient: (
    field: "name" | "contact" | "email" | "phone",
    value: string,
  ) => void;
  setLine: (id: string, values: Partial<QuoteLine>) => void;
  addCatalogLine: (equipmentId: string) => void;
  addCustomLine: () => void;
  removeLine: (id: string) => void;
  moveLine: (id: string, direction: -1 | 1) => void;
  catalog: Equipment[];
}

/**
 * KIT Classic: the company's document, modernized from its invoice layout.
 * The component receives resolved data and renders it; it never computes
 * money (quoteTotals does) and never contains proposal content of its own.
 */
export function KitClassicProposal({
  data,
  edit,
}: {
  data: ProposalDocumentData;
  edit?: ProposalEditHandlers;
}) {
  const { proposal, company, client, event, totals } = data;
  const p = (values: Partial<Proposal>) => edit?.patch(values);
  const text = (
    key:
      | "title"
      | "introduction"
      | "scope"
      | "notes"
      | "terms"
      | "paymentTerms"
      | "salesperson"
      | "completionDate"
      | "validUntil",
  ) => (edit ? (value: string) => p({ [key]: value }) : undefined);
  const dates = event
    ? event.start && event.end && event.start !== event.end
      ? `${longDate(event.start)} – ${longDate(event.end)}`
      : longDate(event.start || "")
    : "";
  return (
    <article
      className={`proposal-sheet template-classic ${edit ? "editing" : "print-proposal"}`}
      aria-label={`${proposal.documentType || "PROPUESTA"} ${proposal.number}`}
    >
      <header className="doc-header">
        <div className="doc-brand">
          <Wordmark size={46} label="KIT" className="doc-wordmark" />
          <div className="doc-company">
            <strong className="doc-company-name">{company.company}</strong>
            <span className="doc-slogan">{company.slogan}</span>
            <address className="doc-address">
              {company.address && <span>{company.address}</span>}
              {company.phone && <span>Teléfono: {company.phone}</span>}
              {company.email && <span>{company.email}</span>}
              {company.website && <span>{company.website}</span>}
            </address>
          </div>
        </div>
        <div className="doc-title-block">
          <h1 className="doc-kind">{proposal.documentType || "PROPUESTA"}</h1>
          <dl className="doc-ids">
            <div>
              <dt>Fecha</dt>
              <dd>{longDate(data.issuedOn) || "—"}</dd>
            </div>
            <div>
              <dt>Propuesta #</dt>
              <dd>
                {proposal.number}
                <span className="doc-version"> · v{proposal.version}</span>
              </dd>
            </div>
          </dl>
        </div>
      </header>
      <div className="doc-rule" aria-hidden="true">
        <span className="r" />
        <span className="b" />
        <span className="g" />
      </div>

      <section className="doc-parties">
        <div className="doc-for">
          <span className="doc-label">Para</span>
          <DocText
            as="strong"
            className="doc-client-name"
            label="Cliente"
            value={client.name}
            onChange={edit ? (v) => edit.setClient("name", v) : undefined}
          />
          <DocText
            label="Contacto"
            value={client.contact}
            onChange={edit ? (v) => edit.setClient("contact", v) : undefined}
          />
          <DocText
            label="Teléfono del cliente"
            value={client.phone}
            type="tel"
            onChange={edit ? (v) => edit.setClient("phone", v) : undefined}
          />
          <DocText
            label="Email del cliente"
            value={client.email}
            type="email"
            onChange={edit ? (v) => edit.setClient("email", v) : undefined}
          />
          {!edit && !client.name && (
            <p className="doc-text doc-muted">Cliente por confirmar</p>
          )}
        </div>
        <div className="doc-meta">
          <DocCell label="Vendedor">
            <DocText
              label="Vendedor"
              value={proposal.salesperson ?? ""}
              onChange={text("salesperson")}
            />
            {!edit && !proposal.salesperson && (
              <span className="doc-muted">—</span>
            )}
          </DocCell>
          <DocCell label="Trabajo">
            <DocText
              label="Trabajo"
              value={proposal.scope ?? ""}
              onChange={text("scope")}
              placeholder="Qué se realiza"
            />
            {!edit && !proposal.scope && <span className="doc-muted">—</span>}
          </DocCell>
          <DocCell label="Términos de pago">
            <DocText
              label="Términos de pago"
              value={proposal.paymentTerms ?? ""}
              onChange={text("paymentTerms")}
              placeholder="Contra entrega (COD)"
            />
            {!edit && !proposal.paymentTerms && (
              <span className="doc-muted">—</span>
            )}
          </DocCell>
          <DocCell label="Fecha de término">
            {edit ? (
              <DocText
                label="Fecha de término"
                type="date"
                value={proposal.completionDate ?? ""}
                onChange={text("completionDate")}
              />
            ) : (
              <span>{longDate(data.completion) || "—"}</span>
            )}
          </DocCell>
        </div>
      </section>

      <section className="doc-intro">
        <DocText
          as="h2"
          className="doc-title"
          label="Título de la propuesta"
          value={proposal.title}
          onChange={text("title")}
        />
        {event && (
          <p className="doc-event">
            {event.name}
            {event.type ? ` · ${event.type}` : ""}
            {event.venue ? ` · ${event.venue}` : ""}
            {dates ? ` · ${dates}` : ""}
            {event.attendees ? ` · ${event.attendees} asistentes` : ""}
          </p>
        )}
        <DocText
          multiline
          className="doc-paragraph"
          label="Introducción y alcance del evento"
          value={proposal.introduction}
          onChange={text("introduction")}
        />
      </section>

      <section className="doc-lines">
        <h3 className="doc-section">Equipos y servicios</h3>
        <div
          className="doc-table-wrap"
          tabIndex={0}
          role="region"
          aria-label="Equipos y servicios (desplazable)"
        >
          <table className="doc-table">
            <thead>
              <tr>
                <th className="num">Cant.</th>
                <th>Descripción</th>
                <th className="num">Días</th>
                <th className="num">Precio unitario</th>
                <th className="num">Total</th>
                {edit && <th className="doc-row-tools" />}
              </tr>
            </thead>
            <tbody>
              {proposal.lines.map((line, index) => (
                <tr key={line.id}>
                  <td className="num">
                    {edit ? (
                      <input
                        className="doc-input num"
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`${line.description || "Partida"} Cantidad`}
                        value={line.quantity}
                        onChange={(e) =>
                          edit.setLine(line.id, {
                            quantity: Number(e.target.value),
                          })
                        }
                      />
                    ) : (
                      line.quantity
                    )}
                  </td>
                  <td>
                    {edit ? (
                      <textarea
                        className="doc-input doc-area"
                        rows={1}
                        aria-label={`Descripción de la partida ${index + 1}`}
                        value={line.description}
                        placeholder="Descripción"
                        onChange={(e) =>
                          edit.setLine(line.id, { description: e.target.value })
                        }
                      />
                    ) : (
                      line.description
                    )}
                  </td>
                  <td className="num">
                    {edit ? (
                      <input
                        className="doc-input num"
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`${line.description || "Partida"} Días`}
                        value={line.days}
                        onChange={(e) =>
                          edit.setLine(line.id, {
                            days: Number(e.target.value),
                          })
                        }
                      />
                    ) : (
                      line.days
                    )}
                  </td>
                  <td className="num">
                    {edit ? (
                      <input
                        className="doc-input num"
                        type="number"
                        min="0"
                        step=".01"
                        aria-label={`${line.description || "Partida"} Tarifa`}
                        value={line.rate}
                        onChange={(e) =>
                          edit.setLine(line.id, {
                            rate: Number(e.target.value),
                          })
                        }
                      />
                    ) : (
                      money(line.rate)
                    )}
                  </td>
                  <td className="num doc-line-total">
                    {money(line.quantity * line.rate * line.days)}
                  </td>
                  {edit && (
                    <td className="doc-row-tools">
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Subir ${line.description || "partida"}`}
                        disabled={index === 0}
                        onClick={() => edit.moveLine(line.id, -1)}
                      >
                        <ArrowUp size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Bajar ${line.description || "partida"}`}
                        disabled={index === proposal.lines.length - 1}
                        onClick={() => edit.moveLine(line.id, 1)}
                      >
                        <ArrowDown size={14} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Quitar ${line.description || "partida"}`}
                        onClick={() => edit.removeLine(line.id)}
                      >
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {!proposal.lines.length && !edit && (
                <tr>
                  <td colSpan={5} className="doc-muted">
                    Sin partidas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {edit && (
          <div className="doc-add-line">
            <label className="doc-add-catalog">
              <span className="visually-hidden">
                Agregar equipo del catálogo
              </span>
              <select
                aria-label="Agregar equipo del catálogo"
                value=""
                onChange={(e) => {
                  if (e.target.value) edit.addCatalogLine(e.target.value);
                }}
              >
                <option value="">+ Agregar del catálogo de equipos</option>
                {edit.catalog.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {money(item.rate)}/día
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button secondary"
              onClick={edit.addCustomLine}
            >
              <Plus size={15} aria-hidden="true" />
              Servicio personalizado
            </button>
          </div>
        )}
        <dl className="doc-totals">
          <div>
            <dt>Subtotal</dt>
            <dd>{money(totals.subtotal)}</dd>
          </div>
          <div>
            <dt>
              Descuento
              {edit ? (
                <>
                  {" "}
                  <input
                    className="doc-input num doc-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    aria-label="Descuento %"
                    value={proposal.discount}
                    onChange={(e) => p({ discount: Number(e.target.value) })}
                  />
                  %
                </>
              ) : proposal.discount ? (
                ` (${proposal.discount}%)`
              ) : (
                ""
              )}
            </dt>
            <dd>{totals.discount ? `−${money(totals.discount)}` : money(0)}</dd>
          </div>
          {proposal.tax > 0 && (
            <div>
              <dt>Impuestos ({proposal.tax}%)</dt>
              <dd>{money(totals.tax)}</dd>
            </div>
          )}
          <div className="doc-grand-total">
            <dt>Total</dt>
            <dd>{money(totals.total)}</dd>
          </div>
        </dl>
      </section>

      {(proposal.visuals?.length ?? 0) > 0 && (
        <section className="doc-visuals">
          <h3 className="doc-section">Concepto visual</h3>
          {proposal.visualNarrative && (
            <p className="doc-paragraph">{proposal.visualNarrative}</p>
          )}
          <div className="doc-figures">
            {proposal.visuals!.map((visual) => (
              <figure key={visual.id}>
                <img src={visualSrc(visual)} alt={visual.altText} />
                <figcaption>
                  <strong>{visual.title}</strong>
                  {visual.caption && <span>{visual.caption}</span>}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      {(edit || proposal.notes) && (
        <section className="doc-notes">
          <h3 className="doc-section">Notas / alcance</h3>
          <DocText
            multiline
            className="doc-paragraph"
            label="Notas y alcance"
            value={proposal.notes ?? ""}
            onChange={text("notes")}
            placeholder="Montaje, función y desmontaje; entregas; condiciones del lugar…"
          />
        </section>
      )}

      <section className="doc-terms">
        <h3 className="doc-section">Términos y condiciones</h3>
        <DocText
          multiline
          className="doc-paragraph"
          label="Términos, exclusiones y condiciones de pago"
          value={proposal.terms}
          onChange={text("terms")}
        />
        <p className="doc-validity">
          Válida hasta{" "}
          {edit ? (
            <DocText
              as="span"
              type="date"
              label="Válida hasta"
              value={proposal.validUntil}
              onChange={text("validUntil")}
            />
          ) : (
            <strong>{longDate(proposal.validUntil) || "—"}</strong>
          )}
        </p>
      </section>

      <footer className="doc-footer">
        <span>{company.company}</span>
        <span className="doc-slogan">{company.slogan}</span>
      </footer>
    </article>
  );
}
