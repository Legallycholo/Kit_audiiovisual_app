import { Copy, FileImage, ScanLine, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Button, Field } from "../../shared/ui";
import { id } from "../../shared/domain";
import { uiLabel } from "../../shared/i18n";
import { palette } from "./helpers";
import type { LayoutEditorView } from "./layout-editor-view";

export function LayoutProperties({ ctx }: { ctx: LayoutEditorView }) {
  const {
    view,
    data,
    toast,
    layout,
    setLayout,
    setSelection,
    extracting,
    extractor,
    rightsConfirmed,
    setRightsConfirmed,
    ceilingHeight,
    setCeilingHeight,
    calibrationWidth,
    setCalibrationWidth,
    referenceInput,
    object,
    suggestions,
    change,
    edit,
    loadReference,
    calibrateReference,
    extractGeometry,
  } = ctx;
  return (
    <>
      <aside className="object-properties">
        <span className="eyebrow">
          {object ? "PROPIEDADES DEL OBJETO" : "PROPIEDADES DEL ESPACIO"}
        </span>
        {object ? (
          <>
            <h3>{uiLabel(object.kind)}</h3>
            {view === "3D" && (
              <div className="scene-model-state">
                <Badge tone="neutral">Geometría provisional</Badge>
                <small>
                  {data.equipment.find((item) => item.id === object.equipmentId)
                    ?.name || "Sin modelo de catálogo asignado"}
                </small>
              </div>
            )}
            {object.source === "Extracted" && (
              <div className="geometry-review-card">
                <Badge
                  tone={object.reviewStatus === "Suggested" ? "amber" : "green"}
                >
                  {object.reviewStatus === "Suggested"
                    ? `Sugerencia · ${Math.round((object.confidence || 0) * 100)}%`
                    : object.reviewStatus === "Corrected"
                      ? "Corregido manualmente"
                      : "Aceptado"}
                </Badge>
                {object.reviewStatus === "Suggested" && (
                  <div>
                    <Button
                      variant="secondary"
                      onClick={() => edit({ reviewStatus: "Accepted" })}
                    >
                      Aceptar
                    </Button>
                    <button
                      className="text-button danger-text"
                      onClick={() => {
                        change(
                          layout.objects.filter(
                            (item) => item.id !== object.id,
                          ),
                        );
                        setSelection(null);
                      }}
                    >
                      Descartar
                    </button>
                  </div>
                )}
              </div>
            )}
            <Field label="Label">
              <input
                value={object.label}
                onChange={(e) => edit({ label: e.target.value })}
              />
            </Field>
            <div className="form-grid">
              {(
                ["x", "y", "width", "depth", "height", "rotation"] as const
              ).map((k) => (
                <Field
                  key={k}
                  label={`${k === "x" ? "Position X" : k === "y" ? "Position Y" : k[0].toUpperCase() + k.slice(1)} ${k === "rotation" ? "°" : "· m"}`}
                >
                  <input
                    type="number"
                    min={
                      ["width", "depth", "height"].includes(k)
                        ? ".1"
                        : k === "rotation"
                          ? "-360"
                          : "0"
                    }
                    step=".1"
                    value={object[k]}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isFinite(n)) return;
                      if (k === "x")
                        edit({
                          x: Math.max(
                            0,
                            Math.min(layout.width - object.width, n),
                          ),
                        });
                      else if (k === "y")
                        edit({
                          y: Math.max(
                            0,
                            Math.min(layout.depth - object.depth, n),
                          ),
                        });
                      else if (k === "width")
                        edit({
                          width: Math.max(
                            0.1,
                            Math.min(layout.width - object.x, n),
                          ),
                        });
                      else if (k === "depth")
                        edit({
                          depth: Math.max(
                            0.1,
                            Math.min(layout.depth - object.y, n),
                          ),
                        });
                      else if (k === "height")
                        edit({ height: Math.max(0.1, n) });
                      else edit({ rotation: Math.max(-360, Math.min(360, n)) });
                    }}
                  />
                </Field>
              ))}
            </div>
            <Field label="Equipment mapping">
              <select
                value={object.equipmentId || ""}
                onChange={(e) => {
                  const equipmentId = e.target.value || undefined;
                  edit({
                    equipmentId,
                    equipmentQuantity: equipmentId
                      ? object.equipmentQuantity || 1
                      : undefined,
                  });
                }}
              >
                <option value="">Solo concepto / sin equipo vinculado</option>
                {data.equipment.map((q) => (
                  <option value={q.id} key={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
            </Field>
            {object.equipmentId && (
              <Field label="Cantidad representada">
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={object.equipmentQuantity || 1}
                  onChange={(e) =>
                    edit({
                      equipmentQuantity: Math.max(
                        1,
                        Math.floor(Number(e.target.value) || 1),
                      ),
                    })
                  }
                />
              </Field>
            )}
            {["Stage", "Booth", "LED wall", "Screen", "Decoration"].includes(
              object.kind,
            ) && (
              <div className="surface-fields">
                <span className="eyebrow">SUPERFICIE VISUAL</span>
                <Field label="Color de superficie">
                  <input
                    type="color"
                    value={object.surfaceColor || palette[object.kind]}
                    onChange={(event) =>
                      edit({ surfaceColor: event.target.value })
                    }
                  />
                </Field>
                <Field label="Texto de marca">
                  <input
                    maxLength={200}
                    value={object.surfaceLabel || ""}
                    placeholder="Nombre o mensaje visible"
                    onChange={(event) =>
                      edit({ surfaceLabel: event.target.value || undefined })
                    }
                  />
                </Field>
                {(object.surfaceColor || object.surfaceLabel) && (
                  <button
                    className="text-button"
                    onClick={() =>
                      edit({
                        surfaceColor: undefined,
                        surfaceLabel: undefined,
                      })
                    }
                  >
                    Restablecer superficie
                  </button>
                )}
              </div>
            )}
            <p className="tiny muted">
              El vínculo identifica el equipo. No reserva inventario ni agrega
              cargos a la cotización.
            </p>
            <div className="property-actions">
              <Button
                variant="secondary"
                onClick={() => {
                  const next = {
                    ...object,
                    id: id(),
                    x: Math.min(layout.width - object.width, object.x + 1),
                    y: Math.min(layout.depth - object.depth, object.y + 1),
                  };
                  change([...layout.objects, next]);
                  setSelection(next.id);
                }}
              >
                <Copy size={14} />
                Duplicate
              </Button>
              <button
                className="icon-button danger-text"
                aria-label="Eliminar objeto seleccionado"
                onClick={() => {
                  change(layout.objects.filter((o) => o.id !== object.id));
                  setSelection(null);
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </>
        ) : (
          <>
            <h3>Espacio del evento</h3>
            <p>
              Selecciona un objeto para editar su tamaño, posición y equipo
              vinculado.
            </p>
            <Field label="Width · m">
              <input
                type="number"
                min="1"
                value={layout.width}
                onChange={(e) =>
                  setLayout({
                    ...layout,
                    width: Math.max(1, Number(e.target.value)),
                    verified: false,
                    verifiedAt: undefined,
                  })
                }
              />
            </Field>
            <Field label="Depth · m">
              <input
                type="number"
                min="1"
                value={layout.depth}
                onChange={(e) =>
                  setLayout({
                    ...layout,
                    depth: Math.max(1, Number(e.target.value)),
                    verified: false,
                    verifiedAt: undefined,
                  })
                }
              />
            </Field>
            <div className="reference-tools">
              <div className="reference-heading">
                <strong>Plano de referencia</strong>
                {layout.reference && (
                  <Badge
                    tone={layout.reference.calibratedAt ? "green" : "amber"}
                  >
                    {layout.reference.calibratedAt
                      ? "Calibrado"
                      : "Sin calibrar"}
                  </Badge>
                )}
              </div>
              <label className="rights-confirmation">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(event) => setRightsConfirmed(event.target.checked)}
                />
                Confirmo que tengo permiso para usar y procesar este plano.
              </label>
              <input
                ref={referenceInput}
                className="visually-hidden"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                aria-label="Cargar plano de referencia"
                onChange={(event) => {
                  void loadReference(event.target.files?.[0]).catch((error) =>
                    toast((error as Error).message),
                  );
                  event.currentTarget.value = "";
                }}
              />
              <Button
                variant="secondary"
                disabled={!rightsConfirmed}
                onClick={() => referenceInput.current?.click()}
              >
                <FileImage size={14} />
                {layout.reference ? "Cambiar imagen" : "Cargar imagen"}
              </Button>
              {layout.reference && (
                <>
                  <small>{layout.reference.name} · máximo guardado 1 MB</small>
                  <Field label="Opacidad de referencia">
                    <input
                      type="range"
                      min="0.05"
                      max="1"
                      step="0.05"
                      value={layout.reference.opacity}
                      onChange={(event) =>
                        setLayout({
                          ...layout,
                          reference: {
                            ...layout.reference!,
                            opacity: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                  <Field label="Ancho conocido de la imagen · m">
                    <input
                      type="number"
                      min="0.1"
                      step="0.1"
                      value={calibrationWidth}
                      onChange={(event) =>
                        setCalibrationWidth(event.target.value)
                      }
                    />
                  </Field>
                  <Field label="Altura del techo · m">
                    <input
                      type="number"
                      min="0.5"
                      max="100"
                      step="0.1"
                      value={ceilingHeight}
                      onChange={(event) => setCeilingHeight(event.target.value)}
                    />
                  </Field>
                  <small>
                    La calibración usa la proporción completa de la imagen para
                    calcular la profundidad.
                  </small>
                  <div className="reference-actions">
                    <Button variant="secondary" onClick={calibrateReference}>
                      <ScanLine size={14} />
                      Calibrar escala
                    </Button>
                    <button
                      className="text-button danger-text"
                      onClick={() =>
                        setLayout({
                          ...layout,
                          reference: undefined,
                          verified: false,
                          verifiedAt: undefined,
                        })
                      }
                    >
                      Quitar
                    </button>
                  </div>
                  <div className="extraction-status">
                    <div>
                      <strong>Extracción estructurada</strong>
                      <small>
                        {extractor.configured
                          ? `${extractor.provider} · ${extractor.model}`
                          : "Proveedor pendiente de tu selección. No se envía el plano."}
                      </small>
                    </div>
                    <Button
                      variant="secondary"
                      disabled={
                        extracting ||
                        !extractor.configured ||
                        !layout.reference.calibratedAt
                      }
                      onClick={() => void extractGeometry()}
                    >
                      <ScanLine size={14} />
                      {extracting ? "Analizando…" : "Extraer geometría"}
                    </Button>
                  </div>
                </>
              )}
            </div>
            {(suggestions.length > 0 || layout.provenance) && (
              <div className="geometry-review-card">
                <div>
                  <strong>Revisión de geometría</strong>
                  <Badge tone={suggestions.length ? "amber" : "green"}>
                    {suggestions.length
                      ? `${suggestions.length} pendientes`
                      : "Revisada"}
                  </Badge>
                </div>
                {layout.provenance && (
                  <small>
                    {layout.provenance.provider || "Manual"} ·{" "}
                    {layout.provenance.sourceName || "sin archivo"}
                  </small>
                )}
                {suggestions.length > 0 && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      setLayout({
                        ...layout,
                        objects: layout.objects.map((item) =>
                          item.reviewStatus === "Suggested"
                            ? { ...item, reviewStatus: "Accepted" }
                            : item,
                        ),
                        provenance: layout.provenance
                          ? {
                              ...layout.provenance,
                              reviewedAt: new Date().toISOString(),
                            }
                          : undefined,
                      })
                    }
                  >
                    Aceptar todas las sugerencias
                  </Button>
                )}
              </div>
            )}
            <Field label="Fuente de las medidas">
              <textarea
                rows={3}
                placeholder="Ej.: levantamiento del salón confirmado por el lugar el 15 oct 2026"
                value={layout.verificationNote || ""}
                onChange={(event) =>
                  setLayout({
                    ...layout,
                    verificationNote: event.target.value,
                    verified: false,
                    verifiedAt: undefined,
                  })
                }
              />
            </Field>
            <Button
              variant="secondary"
              disabled={
                (!layout.verified && !layout.verificationNote?.trim()) ||
                suggestions.length > 0
              }
              onClick={() =>
                setLayout({
                  ...layout,
                  verified: !layout.verified,
                  verifiedAt: layout.verified
                    ? undefined
                    : new Date().toISOString(),
                })
              }
            >
              <ShieldCheck size={14} />
              {layout.verified
                ? "Marcar medidas sin verificar"
                : "Confirmar medidas verificadas"}
            </Button>
            {view === "3D" && (layout.cameras?.length || 0) >= 2 && (
              <div className="camera-path-editor">
                <div>
                  <strong>Ruta de cámara</strong>
                  <Badge tone={layout.cameraPath ? "green" : "neutral"}>
                    {layout.cameraPath ? "Configurada" : "Sin guardar"}
                  </Badge>
                </div>
                <small>
                  El orden define el recorrido del video cuando conectemos el
                  codificador que selecciones.
                </small>
                {(
                  layout.cameraPath?.cameraIds ||
                  layout.cameras!.map((camera) => camera.id)
                ).map((cameraId, index, cameraIds) => {
                  const camera = layout.cameras!.find(
                    (item) => item.id === cameraId,
                  );
                  return (
                    <div className="camera-path-row" key={cameraId}>
                      <span>
                        {index + 1}. {camera?.name || "Vista eliminada"}
                      </span>
                      <div>
                        <button
                          className="text-button"
                          aria-label={`Subir ${camera?.name || "cámara"}`}
                          disabled={index === 0}
                          onClick={() => {
                            const next = [...cameraIds];
                            [next[index - 1], next[index]] = [
                              next[index],
                              next[index - 1],
                            ];
                            setLayout({
                              ...layout,
                              cameraPath: {
                                cameraIds: next,
                                durationSeconds:
                                  layout.cameraPath?.durationSeconds || 30,
                              },
                            });
                          }}
                        >
                          ↑
                        </button>
                        <button
                          className="text-button"
                          aria-label={`Bajar ${camera?.name || "cámara"}`}
                          disabled={index === cameraIds.length - 1}
                          onClick={() => {
                            const next = [...cameraIds];
                            [next[index], next[index + 1]] = [
                              next[index + 1],
                              next[index],
                            ];
                            setLayout({
                              ...layout,
                              cameraPath: {
                                cameraIds: next,
                                durationSeconds:
                                  layout.cameraPath?.durationSeconds || 30,
                              },
                            });
                          }}
                        >
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
                <div className="export-gate">
                  <Badge tone="amber">MP4 pendiente</Badge>
                  <small>
                    1080p · {layout.cameraPath?.durationSeconds || 30} s. Sin
                    costo ni tiempo estimado hasta elegir codificador.
                  </small>
                </div>
              </div>
            )}
          </>
        )}
        <div className="dimension-note">
          <Badge tone={layout.verified ? "green" : "amber"}>
            {layout.verified ? "Medidas verificadas" : "Medidas sin verificar"}
          </Badge>
          <p>
            {layout.verified
              ? `Fuente: ${layout.verificationNote}`
              : "Confirma las medidas del lugar antes de usar este diseño para producción."}
          </p>
        </div>
        {view === "3D" && (
          <p className="tiny muted">
            La vista 3D usa las mismas medidas y posiciones. Los objetos son
            representaciones geométricas simples; no es una simulación de
            iluminación ni de ingeniería.
          </p>
        )}
      </aside>
    </>
  );
}
