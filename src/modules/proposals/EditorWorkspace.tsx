import { uiLabel } from "../../shared/i18n";
import { Link } from "react-router-dom";
import {
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  Check,
  Image as ImageIcon,
  Boxes,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Avatar, Button, Empty, Field, Panel, Wordmark } from "../../shared/ui";
import { id, money, shortDate } from "../../shared/domain";
import type { Proposal } from "../../shared/types";
import { createVisualNarrative } from "../../shared/proposal-visuals";
import { CalendarDaysInline } from "./helpers";
import type { EditorView } from "./editor-view";

export function EditorWorkspace({ ctx }: { ctx: EditorView }) {
  const {
    data,
    user,
    draft,
    setDraft,
    setError,
    setSending,
    setOutgoingMessage,
    section,
    setSection,
    locked,
    event,
    client,
    creativeOptions,
    layoutOptions,
    totals,
    dirty,
    addCreativeVisual,
    addLayoutVisual,
    updateVisual,
    removeVisual,
    moveVisual,
    save,
  } = ctx;
  return (
    <>
      <div className="proposal-workspace">
        <aside className="proposal-outline">
          <span className="eyebrow">{uiLabel("DOCUMENT SECTIONS")}</span>
          {[
            "Introduction",
            "Equipment & services",
            "Visuals",
            "Terms & details",
          ].map((s, i) => (
            <button
              className={section === s ? "active" : ""}
              onClick={() => setSection(s)}
              key={s}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {uiLabel(s)}
            </button>
          ))}
          <div className="proposal-client">
            <Avatar label={client?.initials || "CL"} color={client?.color} />
            <strong>{client?.name}</strong>
            <small>{client?.contact}</small>
            <small>{client?.email}</small>
          </div>
          <div className="save-indicator">
            <span className={`mini-dot ${dirty ? "amber" : "green"}`} />
            {dirty ? uiLabel("Unsaved changes") : uiLabel("Saved revision")}
          </div>
        </aside>
        <Panel className="proposal-document">
          <div className="document-brand">
            <Wordmark size={30} className="document-wordmark" />
            <span>{uiLabel("AUDIOVISUAL EXPERIENCES")}</span>
          </div>
          <div className="document-caption">
            {uiLabel("PREPARED FOR")} {client?.name.toUpperCase()}
          </div>
          {section === "Introduction" && (
            <div className="document-fields">
              <Field label={uiLabel("Proposal title")}>
                <input
                  className="title-input"
                  disabled={locked}
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                />
              </Field>
              <Field label={uiLabel("Introduction & event scope")}>
                <textarea
                  rows={9}
                  disabled={locked}
                  value={draft.introduction}
                  onChange={(e) =>
                    setDraft({ ...draft, introduction: e.target.value })
                  }
                />
              </Field>
              <div className="document-event">
                <CalendarDaysInline />
                <div>
                  <strong>{event?.name}</strong>
                  <p>
                    {event
                      ? `${shortDate(event.date)} – ${shortDate(event.endDate)}`
                      : ""}{" "}
                    · {event?.attendees} asistentes
                  </p>
                </div>
              </div>
            </div>
          )}
          {section === "Equipment & services" && (
            <div className="document-fields">
              <h2>{uiLabel("Equipment & services")}</h2>
              <p className="muted">
                {uiLabel(
                  "Rate \u00D7 quantity \u00D7 rental days. Prices are saved with this revision.",
                )}
              </p>
              <div className="quote-lines">
                {draft.lines.map((line, i) => (
                  <div className="quote-line" key={line.id}>
                    <Field label={`Partida ${i + 1}`}>
                      <input
                        disabled={locked}
                        value={line.description}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            lines: draft.lines.map((l) =>
                              l.id === line.id
                                ? { ...l, description: e.target.value }
                                : l,
                            ),
                          })
                        }
                      />
                    </Field>
                    <div className="quote-line-values">
                      {(["quantity", "rate", "days"] as const).map((key) => (
                        <Field
                          key={key}
                          label={
                            key === "rate"
                              ? uiLabel("Rate · USD")
                              : key === "quantity"
                                ? uiLabel("Quantity")
                                : uiLabel("Days")
                          }
                        >
                          <input
                            aria-label={`${line.description} ${uiLabel(key === "rate" ? "Rate" : key === "days" ? "Days" : "Quantity")}`}
                            disabled={locked}
                            type="number"
                            min="0"
                            step={key === "rate" ? ".01" : "1"}
                            value={line[key]}
                            onChange={(e) =>
                              setDraft({
                                ...draft,
                                lines: draft.lines.map((l) =>
                                  l.id === line.id
                                    ? { ...l, [key]: Number(e.target.value) }
                                    : l,
                                ),
                              })
                            }
                          />
                        </Field>
                      ))}
                      <strong>
                        {money(line.quantity * line.rate * line.days)}
                      </strong>
                      {!locked && (
                        <button
                          className="icon-button"
                          aria-label={`Remove ${line.description}`}
                          onClick={() =>
                            setDraft({
                              ...draft,
                              lines: draft.lines.filter(
                                (l) => l.id !== line.id,
                              ),
                            })
                          }
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {!locked && (
                <div className="add-line-row">
                  <select
                    aria-label={uiLabel("Add equipment from catalog")}
                    value=""
                    onChange={(e) => {
                      const item = data.equipment.find(
                        (q) => q.id === e.target.value,
                      );
                      if (item)
                        setDraft({
                          ...draft,
                          lines: [
                            ...draft.lines,
                            {
                              id: id(),
                              equipmentId: item.id,
                              description: item.name,
                              quantity: 1,
                              rate: item.rate,
                              days: 1,
                            },
                          ],
                        });
                    }}
                  >
                    <option value="">
                      {uiLabel("+ Add from equipment catalog")}
                    </option>
                    {data.equipment.map((q) => (
                      <option value={q.id} key={q.id}>
                        {q.name} · {money(q.rate)}/día
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        lines: [
                          ...draft.lines,
                          {
                            id: id(),
                            description: "Additional service",
                            quantity: 1,
                            rate: 0,
                            days: 1,
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    {uiLabel("Custom line")}
                  </Button>
                </div>
              )}
            </div>
          )}
          {section === "Visuals" && (
            <div className="proposal-visual-editor">
              <div className="proposal-visual-settings">
                <Field label="Plantilla de presentación">
                  <select
                    disabled={locked}
                    value={draft.presentationTemplate || "Editorial"}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: "Draft",
                        presentationTemplate: event.target.value as
                          "Minimal" | "Editorial" | "Spotlight",
                      })
                    }
                  >
                    <option value="Minimal">Minimalista</option>
                    <option value="Editorial">Editorial</option>
                    <option value="Spotlight">Protagonista</option>
                  </select>
                </Field>
                <Field label="Narrativa visual">
                  <textarea
                    rows={4}
                    disabled={locked}
                    value={draft.visualNarrative || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        status: "Draft",
                        visualNarrative: event.target.value,
                      })
                    }
                    placeholder="Explica cómo la propuesta visual apoya la experiencia del evento…"
                  />
                </Field>
                {!locked && (
                  <Button
                    variant="secondary"
                    disabled={!(draft.visuals || []).length}
                    onClick={() => {
                      try {
                        setDraft({
                          ...draft,
                          status: "Draft",
                          visualNarrative: createVisualNarrative(
                            event?.name || draft.title,
                            draft.visuals || [],
                          ),
                        });
                        setError("");
                      } catch (caught) {
                        setError((caught as Error).message);
                      }
                    }}
                  >
                    <Sparkles size={15} />
                    Crear borrador narrativo local
                  </Button>
                )}
              </div>
              {!locked && (
                <div className="proposal-media-picker">
                  <div>
                    <strong>Conceptos creativos aprobados</strong>
                    {creativeOptions.length ? (
                      creativeOptions.map((asset) => {
                        const added = draft.visuals?.some(
                          (visual) =>
                            visual.sourceType === "Creative" &&
                            visual.sourceId === asset.id &&
                            visual.sourceRevision === asset.revision,
                        );
                        return (
                          <div className="proposal-media-option" key={asset.id}>
                            <img src={asset.dataUrl} alt="" />
                            <span>
                              <b>{asset.title}</b>
                              <small>
                                Revisión {asset.revision} · aprobada
                              </small>
                            </span>
                            <Button
                              variant="secondary"
                              disabled={added}
                              onClick={() => addCreativeVisual(asset.id)}
                            >
                              <ImageIcon size={14} />
                              {added ? "Añadido" : "Añadir"}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p>
                        No hay conceptos aprobados para este evento. Revisa los
                        conceptos en el Estudio creativo.
                      </p>
                    )}
                  </div>
                  <div>
                    <strong>Diseños del evento</strong>
                    {layoutOptions.length ? (
                      layoutOptions.map((layout) => (
                        <div className="proposal-media-option" key={layout.id}>
                          <span className="proposal-layout-icon">
                            <Boxes size={20} />
                          </span>
                          <span>
                            <b>{layout.name}</b>
                            <small>
                              Revisión {layout.version} ·{" "}
                              {layout.verified
                                ? "medidas verificadas"
                                : "medidas no verificadas"}
                            </small>
                          </span>
                          <div className="proposal-media-option-actions">
                            <Button
                              variant="secondary"
                              disabled={draft.visuals?.some(
                                (visual) =>
                                  visual.sourceType === "Layout plan" &&
                                  visual.sourceId === layout.id &&
                                  visual.sourceRevision === layout.version,
                              )}
                              onClick={() =>
                                addLayoutVisual(layout.id, "Layout plan")
                              }
                            >
                              Añadir 2D
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={draft.visuals?.some(
                                (visual) =>
                                  visual.sourceType === "Layout 3D" &&
                                  visual.sourceId === layout.id &&
                                  visual.sourceRevision === layout.version,
                              )}
                              onClick={() =>
                                addLayoutVisual(layout.id, "Layout 3D")
                              }
                            >
                              Añadir 3D
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>
                        Este evento todavía no tiene un diseño. Ábrelo en el
                        Estudio de diseño para crear uno.
                      </p>
                    )}
                  </div>
                </div>
              )}
              {(draft.visuals || []).length ? (
                <div className="proposal-visual-list">
                  {(draft.visuals || []).map((visual, index) => (
                    <article className="proposal-visual-card" key={visual.id}>
                      <img src={visual.dataUrl} alt={visual.altText} />
                      <div>
                        <div className="proposal-visual-heading">
                          <span>
                            <strong>{visual.title}</strong>
                            <small>
                              {visual.sourceType} · revisión{" "}
                              {visual.sourceRevision}
                              {visual.measurementStatus === "Unverified"
                                ? " · medidas no verificadas"
                                : ""}
                            </small>
                          </span>
                          {!locked && (
                            <span className="proposal-visual-controls">
                              <button
                                className="icon-button"
                                aria-label={`Mover ${visual.title} hacia arriba`}
                                disabled={index === 0}
                                onClick={() => moveVisual(visual.id, -1)}
                              >
                                <ArrowUp size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Mover ${visual.title} hacia abajo`}
                                disabled={
                                  index === (draft.visuals || []).length - 1
                                }
                                onClick={() => moveVisual(visual.id, 1)}
                              >
                                <ArrowDown size={15} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Quitar ${visual.title}`}
                                onClick={() => removeVisual(visual.id)}
                              >
                                <Trash2 size={15} />
                              </button>
                            </span>
                          )}
                        </div>
                        <Field label={`Pie de imagen · ${index + 1}`}>
                          <textarea
                            rows={2}
                            disabled={locked}
                            value={visual.caption}
                            onChange={(event) =>
                              updateVisual(visual.id, {
                                caption: event.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label={`Texto alternativo · ${index + 1}`}>
                          <input
                            disabled={locked}
                            value={visual.altText}
                            onChange={(event) =>
                              updateVisual(visual.id, {
                                altText: event.target.value,
                              })
                            }
                          />
                        </Field>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <Empty
                  title={uiLabel("Give your proposal a visual story")}
                  description="Añade un concepto aprobado o una captura del diseño del evento. Cada recurso queda guardado con esta versión de la propuesta."
                  action={
                    <Link
                      className="button secondary"
                      to={`/design?event=${event?.id}`}
                    >
                      {uiLabel("Open event design")}
                    </Link>
                  }
                />
              )}
            </div>
          )}
          {section === "Terms & details" && (
            <div className="document-fields">
              <Field label={uiLabel("Terms, exclusions & payment conditions")}>
                <textarea
                  disabled={locked}
                  rows={8}
                  value={draft.terms}
                  onChange={(e) =>
                    setDraft({ ...draft, terms: e.target.value })
                  }
                />
              </Field>
              <Field label={uiLabel("Valid until")}>
                <input
                  type="date"
                  disabled={locked}
                  value={draft.validUntil}
                  onChange={(e) =>
                    setDraft({ ...draft, validUntil: e.target.value })
                  }
                />
              </Field>
            </div>
          )}
        </Panel>
        <aside className="proposal-summary">
          <Panel title={uiLabel("Quotation summary")}>
            <div className="panel-body">
              <div className="summary-line">
                <span>Subtotal</span>
                <strong>{money(totals.subtotal)}</strong>
              </div>
              <div className="form-grid">
                <Field label={uiLabel("Discount %")}>
                  <input
                    disabled={locked}
                    type="number"
                    min="0"
                    max="100"
                    value={draft.discount}
                    onChange={(e) =>
                      setDraft({ ...draft, discount: Number(e.target.value) })
                    }
                  />
                </Field>
                <Field label={uiLabel("Tax %")}>
                  <input
                    disabled={locked}
                    type="number"
                    min="0"
                    max="100"
                    step=".01"
                    value={draft.tax}
                    onChange={(e) =>
                      setDraft({ ...draft, tax: Number(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <div className="summary-line muted">
                <span>{uiLabel("Discount")}</span>
                <span>−{money(totals.discount)}</span>
              </div>
              <div className="summary-line muted">
                <span>{uiLabel("Tax")}</span>
                <span>{money(totals.tax)}</span>
              </div>
              <div className="summary-total">
                <span>{uiLabel("Total \u00B7 USD")}</span>
                <strong>{money(totals.total)}</strong>
              </div>
              <p className="tiny muted">
                Los impuestos y términos comerciales requieren revisión. Los
                equipos cotizados no se reservan automáticamente.
              </p>
              {!locked && (
                <Button
                  variant="secondary"
                  onClick={() => save({ ...draft, status: "In review" })}
                >
                  <Check size={16} />
                  {uiLabel("Submit for internal review")}
                </Button>
              )}
              <Button
                variant="secondary"
                disabled={dirty || Boolean(user && !user.isOwner)}
                onClick={() => {
                  setOutgoingMessage(
                    `Hola ${client?.contact.split(" ")[0]}, te compartimos la propuesta para ${event?.name}. Quedamos atentos a tus preguntas.`,
                  );
                  setSending(true);
                }}
              >
                <Send size={15} />
                {uiLabel("Review & send")}
              </Button>
              {dirty && (
                <small>
                  {uiLabel(
                    "Save changes before reviewing the outgoing proposal.",
                  )}
                </small>
              )}
            </div>
          </Panel>
        </aside>
      </div>
    </>
  );
}
