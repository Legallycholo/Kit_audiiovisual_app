import { useEffect, useRef, useState } from "react";
import { useWorkspace, activity } from "../../shared/store";
import {
  id,
  reconcileLayoutEquipment,
  validateLayoutGeometry,
} from "../../shared/domain";
import type { Layout, LayoutObject, ObjectKind } from "../../shared/types";
import type { SceneHandle } from "../Scene";
import { useUnsavedChanges } from "../../shared/useUnsavedChanges";
import { editableLayout, layoutDraftKey } from "./helpers";

export function useLayoutEditorView({
  original,
  view,
  setView,
}: {
  original: Layout;
  view: string;
  setView: (s: string) => void;
}) {
  const { data, update, toast, mode, request } = useWorkspace();
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
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractor, setExtractor] = useState<{
    configured: boolean;
    provider?: string;
    model?: string;
  }>({ configured: false });
  const [rightsConfirmed, setRightsConfirmed] = useState(
    Boolean(initial.current.layout.reference?.rightsConfirmed),
  );
  const [ceilingHeight, setCeilingHeight] = useState(
    String(initial.current.layout.reference?.ceilingHeight || 3),
  );
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
  const scene = useRef<SceneHandle>(null);
  const object = layout.objects.find((o) => o.id === selection);
  const layers = Array.from(new Set(layout.objects.map((o) => o.layer)));
  const visible = layout.objects.filter((o) => !hidden.includes(o.layer));
  const dirty =
    JSON.stringify(editableLayout(layout)) !==
    JSON.stringify(editableLayout(original));
  const reconciliation = reconcileLayoutEquipment(data, layout);
  const suggestions = layout.objects.filter(
    (item) => item.reviewStatus === "Suggested",
  );
  useUnsavedChanges(dirty, save, () =>
    localStorage.removeItem(layoutDraftKey(original.id)),
  );
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
  useEffect(() => {
    if (mode !== "company") return;
    void request<{ configured: boolean; provider?: string; model?: string }>(
      "/design/status",
    )
      .then(setExtractor)
      .catch(() => setExtractor({ configured: false }));
  }, [mode, request]);
  function change(objects: LayoutObject[]) {
    setPast([...past.slice(-49), structuredClone(layout.objects)]);
    setFuture([]);
    setLayout({ ...layout, objects });
  }
  function edit(patch: Partial<LayoutObject>) {
    if (!object) return;
    const reviewed =
      object.source === "Extracted" && object.reviewStatus === "Suggested"
        ? { reviewStatus: "Corrected" as const }
        : {};
    change(
      layout.objects.map((o) =>
        o.id === object.id ? { ...o, ...reviewed, ...patch } : o,
      ),
    );
  }
  function add(kind: ObjectKind) {
    const next: LayoutObject = {
      id: id(),
      kind,
      x: 2,
      y: 2,
      width:
        kind === "Wall"
          ? 4
          : kind === "Door"
            ? 1
            : kind === "Window"
              ? 1.5
              : kind === "Stage"
                ? 6
                : kind === "LED wall"
                  ? 4
                  : kind === "Chair"
                    ? 0.5
                    : 2,
      depth: ["Wall", "Door", "Window"].includes(kind)
        ? 0.15
        : kind === "LED wall"
          ? 0.3
          : kind === "Chair"
            ? 0.5
            : 2,
      height:
        kind === "Wall"
          ? 3
          : kind === "Door"
            ? 2.1
            : kind === "Window"
              ? 1.2
              : kind === "LED wall"
                ? 3
                : kind === "Speaker"
                  ? 2
                  : 0.75,
      rotation: 0,
      label:
        kind === "Booth"
          ? `Booth ${layout.objects.filter((o) => o.kind === kind).length + 1}`
          : kind,
      source: "Manual",
      reviewStatus: "Accepted",
      layer: ["Chair", "Table", "Booth"].includes(kind)
        ? "Furniture"
        : ["Speaker"].includes(kind)
          ? "Audio"
          : ["LED wall", "Screen"].includes(kind)
            ? "Video"
            : kind === "Stage"
              ? "Staging"
              : ["Wall", "Door", "Window", "Exit"].includes(kind)
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
    const reviewedLayout: Layout =
      layout.provenance?.method === "Structured extraction" &&
      !layout.objects.some((item) => item.reviewStatus === "Suggested") &&
      !layout.provenance.reviewedAt
        ? {
            ...layout,
            provenance: {
              ...layout.provenance,
              reviewedAt: new Date().toISOString(),
            },
          }
        : layout;
    const next = {
      ...reviewedLayout,
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
          cameras: structuredClone(original.cameras),
          cameraPath: structuredClone(original.cameraPath),
          provenance: structuredClone(original.provenance),
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
    if (!rightsConfirmed) {
      toast(
        "Confirma que tienes permiso para usar el plano antes de cargarlo.",
      );
      return;
    }
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
        rightsConfirmed: true,
        uploadedAt: new Date().toISOString(),
        ceilingHeight: Number(ceilingHeight) || 3,
        units: "meters",
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
        knownMeasurement: width,
        ceilingHeight: Number(ceilingHeight) || 3,
        units: "meters",
      },
    });
    toast("Referencia calibrada. Verifica la fuente de las medidas.");
  }
  async function extractGeometry() {
    const reference = layout.reference;
    if (!reference?.calibratedAt || !reference.knownMeasurement) {
      toast(
        "Calibra el plano con una medida conocida antes de extraer geometría.",
      );
      return;
    }
    if (mode !== "company" || !extractor.configured) {
      toast(
        "La extracción automática espera el proveedor que selecciones. El trazado manual sigue disponible.",
      );
      return;
    }
    setExtracting(true);
    try {
      const result = await request<{
        objects: LayoutObject[];
        provenance: Layout["provenance"];
      }>("/design/extract", {
        method: "POST",
        body: {
          eventId: layout.eventId,
          layoutId: layout.id,
          name: reference.name,
          mimeType: reference.mimeType,
          dataUrl: reference.dataUrl,
          intrinsicWidth: reference.intrinsicWidth,
          intrinsicHeight: reference.intrinsicHeight,
          roomWidth: layout.width,
          roomDepth: layout.depth,
          knownMeasurement: reference.knownMeasurement,
          ceilingHeight: reference.ceilingHeight || 3,
          units: "meters",
          rightsConfirmed: true,
        },
      });
      setLayout({
        ...layout,
        objects: [
          ...layout.objects.filter((item) => item.reviewStatus !== "Suggested"),
          ...result.objects,
        ],
        provenance: result.provenance,
        verified: false,
        verifiedAt: undefined,
      });
      setView("2D");
      toast(
        `${result.objects.length} elementos detectados. Revisa cada sugerencia antes de verificar el diseño.`,
      );
    } catch (error) {
      toast((error as Error).message);
    } finally {
      setExtracting(false);
    }
  }
  function saveCamera() {
    const current = scene.current?.readCamera();
    if (!current) return;
    const camera = {
      id: id(),
      name: `Vista ${(layout.cameras?.length || 0) + 1}`,
      ...current,
      createdAt: new Date().toISOString(),
    };
    setLayout({
      ...layout,
      cameras: [...(layout.cameras || []), camera],
    });
    setSelectedCameraId(camera.id);
    toast("Vista de cámara guardada en el borrador del plano.");
  }
  function downloadSnapshot() {
    const camera = layout.cameras?.find((item) => item.id === selectedCameraId);
    const caption = `${layout.name} · revisión ${layout.version}${camera ? ` · ${camera.name}` : ""}`;
    const dataUrl = scene.current?.captureSnapshot(caption);
    if (!dataUrl) {
      toast("No se pudo generar la imagen 3D.");
      return;
    }
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = `scene-${layout.id}-v${layout.version}${camera ? `-${camera.name.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}` : ""}.png`;
    link.click();
    toast(`Imagen exportada desde la revisión ${layout.version}.`);
  }
  async function downloadGlb() {
    try {
      const buffer = await scene.current?.exportGlb();
      if (!buffer) throw new Error("No se pudo crear el modelo GLB.");
      const url = URL.createObjectURL(
        new Blob([buffer], { type: "model/gltf-binary" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `scene-${layout.id}-v${layout.version}.glb`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      toast(`Modelo GLB exportado desde la revisión ${layout.version}.`);
    } catch (error) {
      toast((error as Error).message);
    }
  }
  function point(clientX: number, clientY: number) {
    const element = svg.current!;
    const p = element.createSVGPoint();
    p.x = clientX;
    p.y = clientY;
    return p.matrixTransform(element.getScreenCTM()!.inverse());
  }
  return {
    original,
    view,
    setView,
    data,
    update,
    toast,
    mode,
    request,
    initial,
    layout,
    setLayout,
    recovered,
    setRecovered,
    selection,
    setSelection,
    hidden,
    setHidden,
    zoom,
    setZoom,
    versions,
    setVersions,
    equipmentReview,
    setEquipmentReview,
    selectedCameraId,
    setSelectedCameraId,
    extracting,
    setExtracting,
    extractor,
    setExtractor,
    rightsConfirmed,
    setRightsConfirmed,
    ceilingHeight,
    setCeilingHeight,
    calibrationWidth,
    setCalibrationWidth,
    past,
    setPast,
    future,
    setFuture,
    drag,
    setDrag,
    svg,
    referenceInput,
    scene,
    object,
    layers,
    visible,
    dirty,
    reconciliation,
    suggestions,
    change,
    edit,
    add,
    save,
    loadReference,
    calibrateReference,
    extractGeometry,
    saveCamera,
    downloadSnapshot,
    downloadGlb,
    point,
  };
}
export type LayoutEditorView = ReturnType<typeof useLayoutEditorView>;
