import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  Grid2X2,
  History,
  Layers3,
  MousePointer2,
  Plus,
  RotateCcw,
  Save,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useWorkspace, activity } from "../shared/store";
import { Badge, Button, Empty, Field, Modal, PageHeader } from "../shared/ui";
import { downloadFile, id } from "../shared/domain";
import { uiLabel } from "../shared/i18n";
import type { Layout, LayoutObject, ObjectKind } from "../shared/types";
import { useUnsavedChanges } from "../shared/useUnsavedChanges";
const Scene = lazy(() => import("./Scene"));
const palette: Record<string, string> = {
  Stage: "#667c70",
  Table: "#c7d4bd",
  Chair: "#c6d3dc",
  Booth: "#d3c9e1",
  "LED wall": "#7599b0",
  Speaker: "#606777",
  Light: "#e2c883",
  Truss: "#a8afb2",
  Exit: "#b3d1bd",
  Screen: "#95bacb",
  Decoration: "#c7ad9b",
};
const kinds: ObjectKind[] = [
  "Stage",
  "Table",
  "Chair",
  "Booth",
  "LED wall",
  "Speaker",
  "Light",
  "Truss",
  "Exit",
  "Screen",
  "Decoration",
];
export function Design() {
  const { data, update, toast } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const eventId = params.get("event") || data.events[0]?.id;
  const existing = data.layouts.find((l) => l.eventId === eventId);
  const [view, setView] = useState("2D");
  async function createLayout() {
    const event = data.events.find((e) => e.id === eventId);
    const room = data.venues.find((v) => v.id === event?.venueId)?.rooms[0];
    const next: Layout = {
      id: id(),
      eventId: eventId!,
      name: `${room?.name || "Event space"} · Main layout`,
      version: 1,
      width: room?.width || 24,
      depth: room?.depth || 26,
      verified: false,
      objects: [],
      history: [],
    };
    if (!(await update((s) => ({ ...s, layouts: [...s.layouts, next] }))))
      return;
    toast("Event layout created. Confirm room dimensions before production.");
  }
  return (
    <>
      <PageHeader
        eyebrow="GIVE YOUR VISION SOME SPACE"
        title="Design Studio"
        description="One layout. Two perspectives. Every object connected."
        actions={
          <select
            aria-label="Design event"
            value={eventId || ""}
            onChange={(e) => setParams({ event: e.target.value })}
          >
            {data.events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        }
      />
      {existing ? (
        <LayoutEditor
          key={existing.id}
          original={existing}
          view={view}
          setView={setView}
        />
      ) : (
        <Empty
          title="Start with a space"
          description="Create a layout linked to this event's venue. You can add and position objects, then inspect them in 3D."
          action={
            <Button onClick={createLayout}>
              <Plus size={16} />
              Create event layout
            </Button>
          }
        />
      )}
    </>
  );
}
function LayoutEditor({
  original,
  view,
  setView,
}: {
  original: Layout;
  view: string;
  setView: (s: string) => void;
}) {
  const { data, update, toast } = useWorkspace();
  const [layout, setLayout] = useState<Layout>(() => structuredClone(original));
  const [selection, setSelection] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [versions, setVersions] = useState(false);
  const [past, setPast] = useState<LayoutObject[][]>([]);
  const [future, setFuture] = useState<LayoutObject[][]>([]);
  const [drag, setDrag] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
    initial: LayoutObject[];
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const object = layout.objects.find((o) => o.id === selection);
  const layers = Array.from(new Set(layout.objects.map((o) => o.layer)));
  const visible = layout.objects.filter((o) => !hidden.includes(o.layer));
  const dirty =
    JSON.stringify(layout.objects) !== JSON.stringify(original.objects) ||
    layout.width !== original.width ||
    layout.depth !== original.depth;
  useUnsavedChanges(dirty);
  function change(objects: LayoutObject[]) {
    setPast([...past.slice(-49), structuredClone(layout.objects)]);
    setFuture([]);
    setLayout({ ...layout, objects });
  }
  function edit(patch: Partial<LayoutObject>) {
    if (!object) return;
    change(
      layout.objects.map((o) => (o.id === object.id ? { ...o, ...patch } : o)),
    );
  }
  function add(kind: ObjectKind) {
    const next: LayoutObject = {
      id: id(),
      kind,
      x: 2,
      y: 2,
      width:
        kind === "Stage"
          ? 6
          : kind === "LED wall"
            ? 4
            : kind === "Chair"
              ? 0.5
              : 2,
      depth: kind === "LED wall" ? 0.3 : kind === "Chair" ? 0.5 : 2,
      height: kind === "LED wall" ? 3 : kind === "Speaker" ? 2 : 0.75,
      rotation: 0,
      label:
        kind === "Booth"
          ? `Booth ${layout.objects.filter((o) => o.kind === kind).length + 1}`
          : kind,
      layer: ["Chair", "Table", "Booth"].includes(kind)
        ? "Furniture"
        : ["Speaker"].includes(kind)
          ? "Audio"
          : ["LED wall", "Screen"].includes(kind)
            ? "Video"
            : kind === "Stage"
              ? "Staging"
              : kind === "Exit"
                ? "Architecture"
                : "Lighting",
    };
    change([...layout.objects, next]);
    setSelection(next.id);
  }
  async function save() {
    const next = {
      ...layout,
      version: original.version + 1,
      history: [
        ...original.history,
        {
          version: original.version,
          objects: structuredClone(original.objects),
          savedAt: new Date().toISOString(),
        },
      ],
    };
    if (
      !(await update((s) => ({
        ...s,
        layouts: s.layouts.map((l) => (l.id === next.id ? next : l)),
        activity: [
          activity(
            "Layout revision saved",
            `${next.name} · v${next.version}`,
            next.eventId,
          ),
          ...s.activity,
        ],
      })))
    )
      return;
    setLayout(next);
    toast(
      `Layout revision ${next.version} saved. Equipment allocations have not changed.`,
    );
  }
  function point(clientX: number, clientY: number) {
    const element = svg.current!;
    const p = element.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    return p.matrixTransform(element.getScreenCTM()!.inverse());
  }
  return (
    <>
      <div className="design-toolbar">
        <div>
          <Layers3 size={18} />
          <strong>{layout.name}</strong>
          <Badge tone="neutral">v{original.version}</Badge>
        </div>
        <div className="segmented">
          <button
            className={view === "2D" ? "active" : ""}
            onClick={() => setView("2D")}
          >
            <Grid2X2 size={15} />
            {uiLabel("2D plan")}
          </button>
          <button
            className={view === "3D" ? "active" : ""}
            onClick={() => setView("3D")}
          >
            <Box size={15} />
            {uiLabel("3D view")}
          </button>
        </div>
        <div>
          <button
            className="icon-button"
            aria-label="Versiones del diseño"
            onClick={() => setVersions(true)}
          >
            <History size={18} />
          </button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadFile(
                `layout-v${layout.version}.json`,
                JSON.stringify(layout, null, 2),
              )
            }
          >
            <Download size={15} />
            Export data
          </Button>
          <Button disabled={!dirty} onClick={save}>
            <Save size={15} />
            Save revision
          </Button>
        </div>
      </div>
      <div className="design-workspace">
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
                        fill={palette[o.kind]}
                        stroke={selection === o.id ? "#2e674a" : "#8b9b85"}
                        strokeWidth={selection === o.id ? ".14" : ".06"}
                      />
                    ) : (
                      <rect
                        width={o.width}
                        height={o.depth}
                        rx=".06"
                        fill={palette[o.kind]}
                        stroke={selection === o.id ? "#2e674a" : "#ffffff"}
                        strokeWidth={selection === o.id ? ".14" : ".04"}
                      />
                    )}
                    <text
                      x={o.width / 2}
                      y={o.depth / 2 + 0.12}
                      textAnchor="middle"
                      fontSize={Math.min(0.4, o.width / 8)}
                      fill={
                        ["Stage", "Speaker"].includes(o.kind)
                          ? "#fff"
                          : "#35473e"
                      }
                      pointerEvents="none"
                    >
                      {o.label}
                    </text>
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
              <Scene layout={layout} hidden={hidden} />
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
        <aside className="object-properties">
          <span className="eyebrow">
            {object ? "PROPIEDADES DEL OBJETO" : "PROPIEDADES DEL ESPACIO"}
          </span>
          {object ? (
            <>
              <h3>{uiLabel(object.kind)}</h3>
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
                        ["width", "depth", "height"].includes(k) ? ".1" : "0"
                      }
                      step=".1"
                      value={object[k]}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (
                          Number.isFinite(n) &&
                          n >=
                            (["width", "depth", "height"].includes(k) ? 0.1 : 0)
                        )
                          edit({ [k]: n });
                      }}
                    />
                  </Field>
                ))}
              </div>
              <Field label="Equipment mapping">
                <select
                  value={object.equipmentId || ""}
                  onChange={(e) =>
                    edit({ equipmentId: e.target.value || undefined })
                  }
                >
                  <option value="">Solo concepto / sin equipo vinculado</option>
                  {data.equipment.map((q) => (
                    <option value={q.id} key={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </Field>
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
                      x: object.x + 1,
                      y: object.y + 1,
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
                    })
                  }
                />
              </Field>
            </>
          )}
          <div className="dimension-note">
            <Badge tone="amber">Dimensions unverified</Badge>
            <p>
              Confirma las medidas del lugar antes de usar este diseño para
              producción.
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
      </div>
      {versions && (
        <Modal
          title="Layout versions"
          description="Saved geometry snapshots. Restoring creates an editable draft without changing the saved revision."
          onClose={() => setVersions(false)}
        >
          <div className="modal-body">
            {original.history.length === 0 && (
              <p>
                No previous revisions yet. Save a changed layout to create the
                first revision.
              </p>
            )}
            {original.history.map((h, i) => (
              <div className="simple-row" key={`${h.version}-${i}`}>
                <strong>Revision {h.version}</strong>
                <span>{h.objects.length} objects</span>
                <Button
                  variant="secondary"
                  onClick={() => {
                    change(structuredClone(h.objects));
                    setVersions(false);
                    toast("Previous geometry restored as an unsaved draft.");
                  }}
                >
                  Restore draft
                </Button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
