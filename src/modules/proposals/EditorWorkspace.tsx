import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Boxes,
  Image as ImageIcon,
  Trash2,
} from "lucide-react";
import { Button, Drawer, Field } from "../../shared/ui";
import { KitClassicProposal } from "./templates/KitClassicProposal";
import { LegacyProposal } from "./templates/LegacyProposal";
import { AIReview, ProposalAssistant } from "./ProposalAssistant";
import { createVisualNarrative } from "../../shared/proposal-visuals";
import type { EditorView } from "./editor-view";

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const change = () => setMatches(media.matches);
    change();
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, [query]);
  return matches;
}

/**
 * Document on the left, KIT on the right (a drawer on small screens). The
 * document is the KIT Classic sheet in edit or preview mode; the options
 * below it (event link, template, visuals) stay out of the printed page.
 */
export function EditorWorkspace({ ctx }: { ctx: EditorView }) {
  const {
    data,
    draft,
    patch,
    preview,
    locked,
    edit,
    document,
    linkEvent,
    assistantOpen,
    setAssistantOpen,
    applySuggestion,
    creativeOptions,
    layoutOptions,
    addCreativeVisual,
    addLayoutVisual,
    updateVisual,
    removeVisual,
    moveVisual,
    setError,
  } = ctx;
  const narrow = useMediaQuery("(max-width: 1099px)");
  // Proposals saved with the earlier templates keep their presentation in preview and print.
  const legacy =
    Boolean(draft.presentationTemplate) &&
    draft.presentationTemplate !== "Classic";
  const assistant = (
    <ProposalAssistant
      draft={draft}
      locked={locked}
      onApply={applySuggestion}
      onClose={() => setAssistantOpen(false)}
    />
  );
  return (
    <div
      className={`proposal-workbench ${assistantOpen && !narrow && !preview ? "with-assistant" : ""}`}
    >
      <div className={`proposal-paper ${preview ? "proposal-print-root" : ""}`}>
        {preview && legacy ? (
          <LegacyProposal data={document} />
        ) : (
          <KitClassicProposal
            data={document}
            edit={preview ? undefined : edit}
          />
        )}
        {!preview && (
          <div className="proposal-options no-print">
            {!locked && (
              <div className="proposal-option-row">
                <Field label="Evento vinculado">
                  <select
                    value={draft.eventId}
                    disabled={Boolean(ctx.original.eventId)}
                    onChange={(e) => linkEvent(e.target.value)}
                  >
                    <option value="">Sin evento (vincular más tarde)</option>
                    {data.events.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Plantilla de presentación">
                  <select
                    value={draft.presentationTemplate || "Classic"}
                    onChange={(e) =>
                      patch({
                        presentationTemplate: e.target.value as
                          "Classic" | "Minimal" | "Editorial" | "Spotlight",
                      })
                    }
                  >
                    <option value="Classic">KIT Classic</option>
                    <option value="Minimal">Minimalista (anterior)</option>
                    <option value="Editorial">Editorial (anterior)</option>
                    <option value="Spotlight">Protagonista (anterior)</option>
                  </select>
                </Field>
              </div>
            )}
            {draft.aiReview && <AIReview review={draft.aiReview} />}
            <details className="proposal-visuals-options">
              <summary>
                Imágenes de la propuesta ({draft.visuals?.length || 0})
              </summary>
              <p className="muted">
                Opcional. Los renders aprobados en KIT Design y las imágenes
                guardadas con esta versión aparecen en el documento.
              </p>
              {!locked && (
                <div className="proposal-media-picker">
                  <div>
                    <strong>Conceptos aprobados</strong>
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
                              <ImageIcon size={14} aria-hidden="true" />
                              {added ? "Añadido" : "Añadir"}
                            </Button>
                          </div>
                        );
                      })
                    ) : (
                      <p className="muted">
                        No hay conceptos aprobados para este evento.{" "}
                        {draft.eventId && (
                          <Link to={`/design?event=${draft.eventId}`}>
                            Abrir KIT Design
                          </Link>
                        )}
                      </p>
                    )}
                  </div>
                  {layoutOptions.length > 0 && (
                    <div>
                      <strong>Diseños guardados</strong>
                      {layoutOptions.map((layout) => (
                        <div className="proposal-media-option" key={layout.id}>
                          <span className="proposal-layout-icon">
                            <Boxes size={20} aria-hidden="true" />
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
                      ))}
                    </div>
                  )}
                </div>
              )}
              {(draft.visuals || []).length > 0 && (
                <div className="proposal-visual-list">
                  <Field label="Narrativa visual">
                    <textarea
                      rows={3}
                      disabled={locked}
                      value={draft.visualNarrative || ""}
                      onChange={(e) =>
                        patch({ visualNarrative: e.target.value })
                      }
                    />
                  </Field>
                  {!locked && (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        try {
                          patch({
                            visualNarrative: createVisualNarrative(
                              document.event?.name || draft.title,
                              draft.visuals || [],
                            ),
                          });
                          setError("");
                        } catch (caught) {
                          setError((caught as Error).message);
                        }
                      }}
                    >
                      Crear borrador narrativo local
                    </Button>
                  )}
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
                                <ArrowUp size={15} aria-hidden="true" />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Mover ${visual.title} hacia abajo`}
                                disabled={
                                  index === (draft.visuals || []).length - 1
                                }
                                onClick={() => moveVisual(visual.id, 1)}
                              >
                                <ArrowDown size={15} aria-hidden="true" />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Quitar ${visual.title}`}
                                onClick={() => removeVisual(visual.id)}
                              >
                                <Trash2 size={15} aria-hidden="true" />
                              </button>
                            </span>
                          )}
                        </div>
                        <Field label={`Pie de imagen · ${index + 1}`}>
                          <textarea
                            rows={2}
                            disabled={locked}
                            value={visual.caption}
                            onChange={(e) =>
                              updateVisual(visual.id, {
                                caption: e.target.value,
                              })
                            }
                          />
                        </Field>
                        <Field label={`Texto alternativo · ${index + 1}`}>
                          <input
                            disabled={locked}
                            value={visual.altText}
                            onChange={(e) => {
                              updateVisual(visual.id, {
                                altText: e.target.value,
                              });
                              setError("");
                            }}
                          />
                        </Field>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </details>
          </div>
        )}
      </div>
      {assistantOpen &&
        !preview &&
        (narrow ? (
          <Drawer
            title="KIT"
            description="Describe, genera y revisa los cambios de esta propuesta."
            onClose={() => setAssistantOpen(false)}
            className="proposal-assistant-drawer"
          >
            {assistant}
          </Drawer>
        ) : (
          assistant
        ))}
    </div>
  );
}
