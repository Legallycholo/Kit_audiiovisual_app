import { useEffect, useRef, useState, lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box,
  Circle,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileImage,
  Grid2X2,
  History,
  Layers3,
  MousePointer2,
  Plus,
  RotateCcw,
  Save,
  ScanLine,
  ShieldCheck,
  Trash2,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useWorkspace, activity } from "../shared/store";
import { Badge, Button, Empty, Field, Modal, PageHeader } from "../shared/ui";
import {
  downloadFile,
  id,
  layoutSvg,
  reconcileLayoutEquipment,
  validateLayoutGeometry,
} from "../shared/domain";
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
const layoutDraftKey = (layoutId: string) => `kit.layout-draft.${layoutId}`;
const editableLayout = (layout: Layout) => ({
  name: layout.name,
  width: layout.width,
  depth: layout.depth,
  objects: layout.objects,
  verified: layout.verified,
  verifiedAt: layout.verifiedAt,
  verificationNote: layout.verificationNote,
  reference: layout.reference,
});
export function Design() {
  const { data, update, toast } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const eventId = params.get("event") || data.events[0]?.id;
  const existing = data.layouts.find((l) => l.eventId === eventId);
  const [view, setView] = useState("2D");
  const [templateId, setTemplateId] = useState("");
  async function createLayout(template?: Layout) {
    const event = data.events.find((e) => e.id === eventId);
    const room = data.venues.find((v) => v.id === event?.venueId)?.rooms[0];
    const width = room?.width || template?.width || 24;
    const depth = room?.depth || template?.depth || 26;
    const templateScale = template
      ? Math.min(width / template.width, depth / template.depth)
      : 1;
    const next: Layout = {
      id: id(),
      eventId: eventId!,
      name: `${room?.name || "Event space"} · Main layout`,
      version: 1,
      width,
      depth,
      verified: false,
      objects: (template?.objects || []).map((object) => ({
        ...structuredClone(object),
        id: id(),
        x: Math.round(object.x * templateScale * 10) / 10,
        y: Math.round(object.y * templateScale * 10) / 10,
        width: Math.round(object.width * templateScale * 10) / 10,
        depth: Math.round(object.depth * templateScale * 10) / 10,
      })),
      history: [],
    };
    if (!(await update((s) => ({ ...s, layouts: [...s.layouts, next] }))))
      return;
    toast(
      template
        ? "Plantilla copiada y ajustada al salón. Confirma todas las medidas."
        : "Event layout created. Confirm room dimensions before production.",
    );
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
            <div className="empty-actions">
              <Button onClick={() => void createLayout()}>
                <Plus size={16} />
                Create event layout
              </Button>
              {data.layouts.length > 0 && (
                <>
                  <label>
                    <span>Usar plano guardado como plantilla</span>
                    <select
                      aria-label="Plano para usar como plantilla"
                      value={templateId}
                      onChange={(event) => setTemplateId(event.target.value)}
                    >
                      <option value="">Selecciona un plano</option>
                      {data.layouts.map((layout) => (
                        <option key={layout.id} value={layout.id}>
                          {layout.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="secondary"
                    disabled={!templateId}
                    onClick={() =>
                      void createLayout(
                        data.layouts.find((layout) => layout.id === templateId),
                      )
                    }
                  >
                    Copiar plantilla
                  </Button>
                </>
              )}
            </div>
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
  const initial = useRef<{ layout: Layout; recovered: boolean } | null>(null);
  if (!initial.current) {
    let recovered: Layout | undefined;
    try {
      const stored = JSON.parse(
        localStorage.getItem(layoutDraftKey(original.id)) || "null",
      );
      if (stored?.baseVersion === original.version)
        recovered = stored.layout as Layout;
    } catch {
      /* An invalid local draft can be replaced by the saved revision. */
    }
    initial.current = {
      layout: structuredClone(recovered || original),
      recovered: Boolean(recovered),
    };
  }
  const [layout, setLayout] = useState<Layout>(initial.current.layout);
  const [recovered, setRecovered] = useState(initial.current.recovered);
  const [selection, setSelection] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1);
  const [versions, setVersions] = useState(false);
  const [equipmentReview, setEquipmentReview] = useState(false);
  const [calibrationWidth, setCalibrationWidth] = useState(
    String(initial.current.layout.width),
  );
  const [past, setPast] = useState<LayoutObject[][]>([]);
  const [future, setFuture] = useState<LayoutObject[][]>([]);
  const [drag, setDrag] = useState<{
    id: string;
    offsetX: number;
    offsetY: number;
    initial: LayoutObject[];
  } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
  const object = layout.objects.find((o) => o.id === selection);
  const layers = Array.from(new Set(layout.objects.map((o) => o.layer)));
  const visible = layout.objects.filter((o) => !hidden.includes(o.layer));
  const dirty =
    JSON.stringify(editableLayout(layout)) !==
    JSON.stringify(editableLayout(original));
  const reconciliation = reconcileLayoutEquipment(data, layout);
  useUnsavedChanges(dirty);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        if (dirty)
          localStorage.setItem(
            layoutDraftKey(original.id),
            JSON.stringify({ baseVersion: original.version, layout }),
          );
        else localStorage.removeItem(layoutDraftKey(original.id));
      } catch {
        /* The saved server/sample revision remains the durable fallback. */
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [dirty, layout, original.id, original.version]);
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
    const geometryErrors = validateLayoutGeometry(layout);
    if (geometryErrors.length) {
      toast(geometryErrors[0]);
      return;
    }
    const next = {
      ...layout,
      version: original.version + 1,
      history: [
        ...original.history,
        {
          version: original.version,
          objects: structuredClone(original.objects),
          savedAt: new Date().toISOString(),
          width: original.width,
          depth: original.depth,
          verified: original.verified,
          verifiedAt: original.verifiedAt,
          verificationNote: original.verificationNote,
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
    localStorage.removeItem(layoutDraftKey(original.id));
    setRecovered(false);
    toast(
      `Layout revision ${next.version} saved. Equipment allocations have not changed.`,
    );
  }
  async function loadReference(file?: File) {
    if (!file) return;
    if (
      !(["image/png", "image/jpeg", "image/webp"] as string[]).includes(
        file.type,
      )
    ) {
      toast("Usa una imagen PNG, JPEG o WebP como referencia.");
      return;
    }
    if (file.size > 1_000_000) {
      toast("La imagen de referencia debe pesar 1 MB o menos.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
      reader.readAsDataURL(file);
    });
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve, reject) => {
        const image = new Image();
        image.onload = () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        image.onerror = () => reject(new Error("La imagen no es válida."));
        image.src = dataUrl;
      },
    );
    setLayout((current) => ({
      ...current,
      verified: false,
      verifiedAt: undefined,
      reference: {
        name: file.name,
        mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
        dataUrl,
        intrinsicWidth: dimensions.width,
        intrinsicHeight: dimensions.height,
        opacity: 0.35,
      },
    }));
    setRecovered(false);
  }
  function calibrateReference() {
    if (!layout.reference) return;
    const width = Number(calibrationWidth);
    if (!Number.isFinite(width) || width <= 0) {
      toast("Ingresa un ancho conocido válido.");
      return;
    }
    const depth =
      Math.round(
        width *
          (layout.reference.intrinsicHeight / layout.reference.intrinsicWidth) *
          100,
      ) / 100;
    const outside = layout.objects.find(
      (item) => item.x + item.width > width || item.y + item.depth > depth,
    );
    if (outside) {
      toast(`${outside.label} quedaría fuera del espacio calibrado.`);
      return;
    }
    setLayout({
      ...layout,
      width,
      depth,
      verified: false,
      verifiedAt: undefined,
      reference: {
        ...layout.reference,
        calibratedAt: new Date().toISOString(),
      },
    });
    toast("Referencia calibrada. Verifica la fuente de las medidas.");
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
          <Badge tone={layout.verified ? "green" : "amber"}>
            {layout.verified ? "Medidas verificadas" : "Sin verificar"}
          </Badge>
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
          <button
            className="icon-button"
            aria-label="Exportar datos JSON"
            onClick={() =>
              downloadFile(
                `layout-v${layout.version}.json`,
                JSON.stringify(layout, null, 2),
              )
            }
          >
            <Download size={17} />
          </button>
          <Button
            variant="secondary"
            onClick={() =>
              downloadFile(
                `layout-v${layout.version}.svg`,
                layoutSvg(layout, data.equipment),
                "image/svg+xml",
              )
            }
          >
            <FileImage size={15} />
            Exportar plano
          </Button>
          <Button variant="secondary" onClick={() => setEquipmentReview(true)}>
            <ScanLine size={15} />
            Revisar equipos
          </Button>
          <Button disabled={!dirty} onClick={save}>
            <Save size={15} />
            Save revision
          </Button>
        </div>
      </div>
      {recovered && (
        <div className="layout-recovery" role="status">
          <div>
            <RotateCcw size={17} />
            <span>
              <strong>Borrador recuperado</strong>
              Cambios locales sin guardar restaurados sobre la versión{" "}
              {original.version}.
            </span>
          </div>
          <Button
            variant="secondary"
            onClick={() => {
              localStorage.removeItem(layoutDraftKey(original.id));
              setLayout(structuredClone(original));
              setRecovered(false);
            }}
          >
            Descartar borrador
          </Button>
        </div>
      )}
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
                        else
                          edit({ rotation: Math.max(-360, Math.min(360, n)) });
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
                  onClick={() => referenceInput.current?.click()}
                >
                  <FileImage size={14} />
                  {layout.reference ? "Cambiar imagen" : "Cargar imagen"}
                </Button>
                {layout.reference && (
                  <>
                    <small>
                      {layout.reference.name} · máximo guardado 1 MB
                    </small>
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
                    <small>
                      La calibración usa la proporción completa de la imagen
                      para calcular la profundidad.
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
                  </>
                )}
              </div>
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
                disabled={!layout.verified && !layout.verificationNote?.trim()}
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
            </>
          )}
          <div className="dimension-note">
            <Badge tone={layout.verified ? "green" : "amber"}>
              {layout.verified
                ? "Medidas verificadas"
                : "Medidas sin verificar"}
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
      </div>
      {equipmentReview && (
        <Modal
          title="Reconciliar equipos"
          description="Compara las cantidades representadas en el plano con la propuesta vigente. Esta revisión no reserva inventario ni cambia la cotización."
          onClose={() => setEquipmentReview(false)}
        >
          <div className="modal-body">
            {reconciliation.proposal ? (
              <div className="reconciliation-source">
                <span>
                  Alcance comparado: {reconciliation.proposal.number} · versión{" "}
                  {reconciliation.proposal.version}
                </span>
                <Badge tone={reconciliation.complete ? "green" : "amber"}>
                  {reconciliation.complete ? "Conciliado" : "Requiere revisión"}
                </Badge>
              </div>
            ) : (
              <div className="info-note">
                No hay una propuesta vigente vinculada a este evento.
              </div>
            )}
            {reconciliation.rows.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Equipo</th>
                      <th>Propuesta</th>
                      <th>Plano</th>
                      <th>Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reconciliation.rows.map((row) => (
                      <tr key={row.equipmentId}>
                        <td>{row.name}</td>
                        <td>{row.required}</td>
                        <td>{row.mapped}</td>
                        <td>
                          <Badge
                            tone={row.difference === 0 ? "green" : "amber"}
                          >
                            {row.difference === 0
                              ? "Coincide"
                              : row.difference > 0
                                ? `+${row.difference}`
                                : row.difference}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="tiny muted">
              Ajusta “Cantidad representada” en cada objeto vinculado. Los
              objetos conceptuales pueden permanecer sin equipo.
            </p>
          </div>
        </Modal>
      )}
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
                    setPast([
                      ...past.slice(-49),
                      structuredClone(layout.objects),
                    ]);
                    setFuture([]);
                    setLayout({
                      ...layout,
                      objects: structuredClone(h.objects),
                      width: h.width || layout.width,
                      depth: h.depth || layout.depth,
                      verified: h.verified || false,
                      verifiedAt: h.verifiedAt,
                      verificationNote: h.verificationNote,
                    });
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
