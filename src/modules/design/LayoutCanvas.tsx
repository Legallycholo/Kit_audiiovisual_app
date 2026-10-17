import { Suspense } from "react";
import {
  Box,
  Camera,
  Circle,
  Download,
  Eye,
  EyeOff,
  ImageDown,
  MousePointer2,
  Trash2,
  Undo2,
  Redo2,
  Rotate3D,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "../../shared/ui";
import { id } from "../../shared/domain";
import { uiLabel } from "../../shared/i18n";
import type { Layout } from "../../shared/types";
import { Scene, kinds, palette } from "./helpers";
import type { LayoutEditorView } from "./layout-editor-view";

export function LayoutCanvas({ ctx }: { ctx: LayoutEditorView }) {
  const {
    view,
    layout,
    setLayout,
    selection,
    setSelection,
    hidden,
    setHidden,
    zoom,
    setZoom,
    selectedCameraId,
    setSelectedCameraId,
    past,
    setPast,
    future,
    setFuture,
    drag,
    setDrag,
    svg,
    scene,
    layers,
    visible,
    dirty,
    add,
    saveCamera,
    downloadSnapshot,
    downloadGlb,
    point,
  } = ctx;
  return (
    <>
      <aside className="object-library">
        <span className="eyebrow">BIBLIOTECA DE OBJETOS</span>
        <p>Selecciona un objeto para agregarlo al diseño.</p>
        <div className="object-buttons">
          {kinds.map((kind) => (
            <button key={kind} onClick={() => add(kind)}>
              <span style={{ background: palette[kind] }}>
                {kind === "Table" ? <Circle size={20} /> : <Box size={20} />}
              </span>
              {uiLabel(kind)}
            </button>
          ))}
        </div>
        <div className="layer-list">
          <span className="eyebrow">CAPAS</span>
          {layers.map((layer) => (
            <button
              key={layer}
              onClick={() =>
                setHidden(
                  hidden.includes(layer)
                    ? hidden.filter((l) => l !== layer)
                    : [...hidden, layer],
                )
              }
            >
              {hidden.includes(layer) ? (
                <EyeOff size={14} />
              ) : (
                <Eye size={14} />
              )}
              <span>{uiLabel(layer)}</span>
              <small>
                {layout.objects.filter((o) => o.layer === layer).length}
              </small>
            </button>
          ))}
        </div>
      </aside>
      <div className="design-canvas">
        <div className="canvas-topline">
          <span>
            <MousePointer2 size={13} />
            {view === "2D"
              ? "Seleccionar y mover"
              : "Arrastra para girar · desplázate para ampliar"}
          </span>
          <span>Unidades: metros</span>
        </div>
        {view === "3D" && (
          <div className="scene-toolbar" aria-label="Controles de cámara 3D">
            <select
              aria-label="Vista de cámara guardada"
              value={selectedCameraId}
              onChange={(event) => {
                const cameraId = event.target.value;
                setSelectedCameraId(cameraId);
                const camera = layout.cameras?.find(
                  (item) => item.id === cameraId,
                );
                if (camera) scene.current?.applyCamera(camera);
              }}
            >
              <option value="">Vista actual sin guardar</option>
              {(layout.cameras || []).map((camera) => (
                <option key={camera.id} value={camera.id}>
                  {camera.name}
                </option>
              ))}
            </select>
            <Button variant="secondary" onClick={saveCamera}>
              <Camera size={14} />
              Guardar cámara
            </Button>
            <button
              className="icon-button"
              aria-label="Restablecer cámara 3D"
              onClick={() => {
                scene.current?.resetCamera();
                setSelectedCameraId("");
              }}
            >
              <Rotate3D size={16} />
            </button>
            {selectedCameraId && (
              <button
                className="icon-button danger-text"
                aria-label="Eliminar cámara guardada"
                onClick={() => {
                  const remaining = (layout.cameraPath?.cameraIds || []).filter(
                    (id) => id !== selectedCameraId,
                  );
                  setLayout({
                    ...layout,
                    cameras: (layout.cameras || []).filter(
                      (camera) => camera.id !== selectedCameraId,
                    ),
                    cameraPath:
                      remaining.length >= 2 && layout.cameraPath
                        ? { ...layout.cameraPath, cameraIds: remaining }
                        : undefined,
                  });
                  setSelectedCameraId("");
                }}
              >
                <Trash2 size={16} />
              </button>
            )}
            <Button
              variant="secondary"
              disabled={dirty}
              title={
                dirty
                  ? "Guarda la revisión antes de exportar una imagen vinculada."
                  : undefined
              }
              onClick={downloadSnapshot}
            >
              <ImageDown size={14} />
              Exportar imagen
            </Button>
            <select
              aria-label="Duración de la ruta de cámara"
              value={layout.cameraPath?.durationSeconds || 30}
              onChange={(event) =>
                setLayout({
                  ...layout,
                  cameraPath: {
                    cameraIds:
                      layout.cameraPath?.cameraIds ||
                      (layout.cameras || []).map((camera) => camera.id),
                    durationSeconds: Number(event.target.value) as 15 | 30 | 60,
                  },
                })
              }
              disabled={(layout.cameras?.length || 0) < 2}
            >
              <option value="15">Ruta · 15 s</option>
              <option value="30">Ruta · 30 s</option>
              <option value="60">Ruta · 60 s</option>
            </select>
            <Button
              variant="secondary"
              disabled={(layout.cameras?.length || 0) < 2}
              onClick={() => {
                const cameraIds =
                  layout.cameraPath?.cameraIds ||
                  (layout.cameras || []).map((camera) => camera.id);
                const cameras = cameraIds
                  .map((cameraId) =>
                    layout.cameras?.find((camera) => camera.id === cameraId),
                  )
                  .filter(Boolean) as NonNullable<Layout["cameras"]>;
                setLayout({
                  ...layout,
                  cameraPath: {
                    cameraIds,
                    durationSeconds: layout.cameraPath?.durationSeconds || 30,
                  },
                });
                scene.current?.previewCameraPath(
                  cameras,
                  layout.cameraPath?.durationSeconds || 30,
                );
              }}
            >
              Vista previa
            </Button>
            <Button
              variant="secondary"
              disabled={dirty}
              title={
                dirty ? "Guarda la revisión antes de exportar." : undefined
              }
              onClick={() => void downloadGlb()}
            >
              <Download size={14} />
              GLB
            </Button>
          </div>
        )}
        {view === "2D" ? (
          <div className="svg-viewport">
            <svg
              ref={svg}
              role="group"
              aria-label="Plano editable del evento"
              viewBox={`${-3 + (layout.width * (1 - 1 / zoom)) / 2} ${-3 + (layout.depth * (1 - 1 / zoom)) / 2} ${(layout.width + 6) / zoom} ${(layout.depth + 6) / zoom}`}
              onPointerMove={(e) => {
                if (!drag) return;
                const p = point(e.clientX, e.clientY);
                setLayout((current) => ({
                  ...current,
                  objects: current.objects.map((o) =>
                    o.id === drag.id
                      ? {
                          ...o,
                          x:
                            Math.round(
                              Math.max(
                                0,
                                Math.min(
                                  current.width - o.width,
                                  p.x - drag.offsetX,
                                ),
                              ) * 10,
                            ) / 10,
                          y:
                            Math.round(
                              Math.max(
                                0,
                                Math.min(
                                  current.depth - o.depth,
                                  p.y - drag.offsetY,
                                ),
                              ) * 10,
                            ) / 10,
                        }
                      : o,
                  ),
                }));
              }}
              onPointerUp={() => {
                if (drag) {
                  setPast([...past.slice(-49), drag.initial]);
                  setFuture([]);
                  setDrag(null);
                }
              }}
              onPointerCancel={() => setDrag(null)}
            >
              <defs>
                <pattern
                  id="floor-grid"
                  width="1"
                  height="1"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M1 0H0V1"
                    fill="none"
                    stroke="#dce1db"
                    strokeWidth=".035"
                  />
                </pattern>
              </defs>
              <rect
                x="0"
                y="0"
                width={layout.width}
                height={layout.depth}
                fill="#fff"
                stroke="#56675b"
                strokeWidth=".16"
                onPointerDown={() => setSelection(null)}
              />
              {layout.reference && (
                <image
                  href={layout.reference.dataUrl}
                  x="0"
                  y="0"
                  width={layout.width}
                  height={layout.depth}
                  opacity={layout.reference.opacity}
                  preserveAspectRatio="none"
                  pointerEvents="none"
                />
              )}
              <rect
                width={layout.width}
                height={layout.depth}
                fill="url(#floor-grid)"
                pointerEvents="none"
              />
              <text
                x={layout.width / 2}
                y="-1.2"
                textAnchor="middle"
                fontSize=".55"
                fill="#7f8d82"
              >
                {layout.width} m
              </text>
              <text
                x="-1.3"
                y={layout.depth / 2}
                textAnchor="middle"
                fontSize=".55"
                fill="#7f8d82"
                transform={`rotate(-90 -1.3 ${layout.depth / 2})`}
              >
                {layout.depth} m
              </text>
              {visible.map((o) => (
                <g
                  key={o.id}
                  role="button"
                  aria-label={`Seleccionar ${o.label}`}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelection(o.id);
                    }
                  }}
                  transform={`translate(${o.x} ${o.y}) rotate(${o.rotation} ${o.width / 2} ${o.depth / 2})`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    setSelection(o.id);
                    const p = point(e.clientX, e.clientY);
                    svg.current?.setPointerCapture(e.pointerId);
                    setDrag({
                      id: o.id,
                      offsetX: p.x - o.x,
                      offsetY: p.y - o.y,
                      initial: structuredClone(layout.objects),
                    });
                  }}
                  style={{ cursor: "move" }}
                >
                  {o.kind === "Table" ? (
                    <ellipse
                      cx={o.width / 2}
                      cy={o.depth / 2}
                      rx={o.width / 2}
                      ry={o.depth / 2}
                      fill={o.surfaceColor || palette[o.kind]}
                      stroke={selection === o.id ? "#2e674a" : "#8b9b85"}
                      strokeWidth={selection === o.id ? ".14" : ".06"}
                    />
                  ) : (
                    <rect
                      width={o.width}
                      height={o.depth}
                      rx=".06"
                      fill={
                        o.reviewStatus === "Suggested"
                          ? o.confidence !== undefined && o.confidence < 0.7
                            ? "#e4b6a0"
                            : "#e6d79b"
                          : o.surfaceColor || palette[o.kind]
                      }
                      stroke={selection === o.id ? "#2e674a" : "#ffffff"}
                      strokeWidth={selection === o.id ? ".14" : ".04"}
                      strokeDasharray={
                        o.reviewStatus === "Suggested" ? ".18 .1" : undefined
                      }
                    />
                  )}
                  <text
                    x={o.width / 2}
                    y={o.depth / 2 + 0.12}
                    textAnchor="middle"
                    fontSize={Math.min(0.4, o.width / 8)}
                    fill={
                      ["Stage", "Speaker"].includes(o.kind) ? "#fff" : "#35473e"
                    }
                    pointerEvents="none"
                  >
                    {o.surfaceLabel || o.label}
                  </text>
                  {selection === o.id && (
                    <text
                      x={o.width / 2}
                      y={o.depth + 0.55}
                      textAnchor="middle"
                      fontSize=".38"
                      fill="#2e674a"
                      pointerEvents="none"
                    >
                      {o.width} × {o.depth} m
                    </text>
                  )}
                  {o.reviewStatus === "Suggested" && (
                    <text
                      x={o.width / 2}
                      y={Math.max(0.3, o.depth / 2 - 0.24)}
                      textAnchor="middle"
                      fontSize=".3"
                      fill="#694f28"
                      pointerEvents="none"
                    >
                      {Math.round((o.confidence || 0) * 100)}% · revisar
                    </text>
                  )}
                </g>
              ))}
            </svg>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="empty">
                <h3>Preparando el espacio 3D…</h3>
              </div>
            }
          >
            <Scene
              ref={scene}
              layout={layout}
              hidden={hidden}
              selection={selection}
              onSelect={setSelection}
            />
          </Suspense>
        )}
        <div className="canvas-controls">
          <div>
            <button
              className="icon-button"
              aria-label="Deshacer cambio del diseño"
              disabled={!past.length}
              onClick={() => {
                setFuture([structuredClone(layout.objects), ...future]);
                setLayout({ ...layout, objects: past[past.length - 1] });
                setPast(past.slice(0, -1));
              }}
            >
              <Undo2 size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Rehacer cambio del diseño"
              disabled={!future.length}
              onClick={() => {
                setPast([...past, structuredClone(layout.objects)]);
                setLayout({ ...layout, objects: future[0] });
                setFuture(future.slice(1));
              }}
            >
              <Redo2 size={17} />
            </button>
          </div>
          <span>
            {layout.objects.length} objetos ·{" "}
            {dirty ? "Cambios sin guardar" : "Diseño guardado"}
          </span>
          {view === "2D" && (
            <div>
              <button
                className="icon-button"
                aria-label="Alejar"
                onClick={() => setZoom(Math.max(0.6, zoom - 0.2))}
              >
                <ZoomOut size={16} />
              </button>
              <button className="text-button" onClick={() => setZoom(1)}>
                {Math.round(zoom * 100)}%
              </button>
              <button
                className="icon-button"
                aria-label="Acercar"
                onClick={() => setZoom(Math.min(3, zoom + 0.2))}
              >
                <ZoomIn size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
