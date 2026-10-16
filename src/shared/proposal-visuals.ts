import type {
  CreativeAsset,
  Layout,
  LayoutObject,
  ProposalVisual,
} from "./types";

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const colors: Record<LayoutObject["kind"], string> = {
  Stage: "#526b43",
  Table: "#9a805f",
  Chair: "#b49d79",
  Booth: "#58758c",
  "LED wall": "#48576f",
  Speaker: "#343b3a",
  Light: "#d59b45",
  Truss: "#78817d",
  Exit: "#6d925b",
  Screen: "#8296aa",
  Decoration: "#9a6f83",
};

const svgUrl = (svg: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

export function createCreativeProposalVisual(input: {
  id: string;
  asset: CreativeAsset;
  addedAt: string;
}): ProposalVisual {
  if (input.asset.status !== "Approved")
    throw new Error("Only approved creative assets can enter a proposal.");
  return {
    id: input.id,
    sourceType: "Creative",
    sourceId: input.asset.id,
    sourceRevision: input.asset.revision,
    title: input.asset.title,
    caption: input.asset.brief,
    altText: `${input.asset.kind} for ${input.asset.title}`,
    dataUrl: input.asset.dataUrl,
    mimeType: input.asset.mimeType,
    addedAt: input.addedAt,
  };
}

export function createVisualNarrative(
  eventName: string,
  visuals: ProposalVisual[],
) {
  if (!visuals.length)
    throw new Error("Add at least one visual before drafting its narrative.");
  const hasCreative = visuals.some(
    (visual) => visual.sourceType === "Creative",
  );
  const hasPlan = visuals.some((visual) => visual.sourceType === "Layout plan");
  const hasScene = visuals.some((visual) => visual.sourceType === "Layout 3D");
  const parts = [
    hasCreative ? "la dirección creativa aprobada" : "",
    hasPlan ? "la distribución propuesta" : "",
    hasScene ? "la vista espacial del montaje" : "",
  ].filter(Boolean);
  const joined =
    parts.length > 1
      ? `${parts.slice(0, -1).join(", ")} y ${parts.at(-1)}`
      : parts[0];
  return `Para ${eventName}, esta propuesta conecta ${joined} en una experiencia visual coherente. El equipo puede ajustar este texto antes de compartir la versión con el cliente.`;
}

function planSvg(layout: Layout) {
  const frame = { x: 70, y: 125, width: 1060, height: 570 };
  const scale = Math.min(
    frame.width / layout.width,
    frame.height / layout.depth,
  );
  const roomWidth = layout.width * scale;
  const roomDepth = layout.depth * scale;
  const left = frame.x + (frame.width - roomWidth) / 2;
  const top = frame.y + (frame.height - roomDepth) / 2;
  const objects = layout.objects
    .map((object) => {
      const x = left + object.x * scale;
      const y = top + object.y * scale;
      const width = Math.max(2, object.width * scale);
      const depth = Math.max(2, object.depth * scale);
      const color = object.surfaceColor || colors[object.kind];
      const label = escapeXml(object.surfaceLabel || object.label);
      return `<g transform="rotate(${object.rotation} ${x + width / 2} ${y + depth / 2})"><rect x="${x}" y="${y}" width="${width}" height="${depth}" rx="3" fill="${color}" fill-opacity=".88" stroke="#ffffff" stroke-width="1.5"/><text x="${x + width / 2}" y="${y + depth / 2 + 4}" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-size="${Math.max(7, Math.min(14, width / 5))}">${label}</text></g>`;
    })
    .join("");
  return `<rect x="${left}" y="${top}" width="${roomWidth}" height="${roomDepth}" fill="#f6f3e9" stroke="#69745f" stroke-width="3"/>${objects}`;
}

function threeDimensionalSvg(layout: Layout) {
  const scale = Math.min(31, 760 / Math.max(1, layout.width + layout.depth));
  const project = (x: number, y: number, z: number) => ({
    x: 600 + (x - y) * scale,
    y: 200 + (x + y) * scale * 0.48 - z * scale,
  });
  const point = (value: { x: number; y: number }) => `${value.x},${value.y}`;
  const floor = [
    project(0, 0, 0),
    project(layout.width, 0, 0),
    project(layout.width, layout.depth, 0),
    project(0, layout.depth, 0),
  ];
  const objects = [...layout.objects]
    .sort((a, b) => a.x + a.y - (b.x + b.y))
    .map((object) => {
      const centerX = object.x + object.width / 2;
      const centerY = object.y + object.depth / 2;
      const radians = (object.rotation * Math.PI) / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      const corners = [
        [-object.width / 2, -object.depth / 2],
        [object.width / 2, -object.depth / 2],
        [object.width / 2, object.depth / 2],
        [-object.width / 2, object.depth / 2],
      ].map(([x, y]) => ({
        x: centerX + x * cosine - y * sine,
        y: centerY + x * sine + y * cosine,
      }));
      const bottom = corners.map((corner) => project(corner.x, corner.y, 0));
      const top = corners.map((corner) =>
        project(corner.x, corner.y, object.height),
      );
      const color = object.surfaceColor || colors[object.kind];
      return `<g><polygon points="${bottom.map(point).join(" ")}" fill="#1e2821" opacity=".22"/><polygon points="${[bottom[1], bottom[2], top[2], top[1]].map(point).join(" ")}" fill="${color}" opacity=".64"/><polygon points="${[bottom[2], bottom[3], top[3], top[2]].map(point).join(" ")}" fill="${color}" opacity=".48"/><polygon points="${top.map(point).join(" ")}" fill="${color}" stroke="#fff" stroke-width="1"/><text x="${top[0].x}" y="${top[0].y - 5}" fill="#283127" font-family="Arial,sans-serif" font-size="9">${escapeXml(object.surfaceLabel || object.label)}</text></g>`;
    })
    .join("");
  return `<polygon points="${floor.map(point).join(" ")}" fill="#e8eadf" stroke="#69745f" stroke-width="3"/>${objects}`;
}

export function createLayoutProposalVisual(input: {
  id: string;
  layout: Layout;
  view: "Layout plan" | "Layout 3D";
  addedAt: string;
}): ProposalVisual {
  if (input.layout.objects.length > 500)
    throw new Error(
      "Simplify the layout to 500 objects or fewer before adding it to a proposal.",
    );
  const verified = input.layout.verified;
  const viewLabel = input.view === "Layout plan" ? "PLANO 2D" : "VISTA 3D";
  const content =
    input.view === "Layout plan"
      ? planSvg(input.layout)
      : threeDimensionalSvg(input.layout);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="${escapeXml(viewLabel)} ${escapeXml(input.layout.name)}">
  <rect width="1200" height="800" fill="#fbfaf5"/>
  <text x="70" y="62" fill="#536448" font-family="Arial,sans-serif" font-size="17" letter-spacing="4">${viewLabel} · PROPUESTA</text>
  <text x="70" y="100" fill="#263128" font-family="Arial,sans-serif" font-size="28" font-weight="700">${escapeXml(input.layout.name)}</text>
  ${content}
  <text x="70" y="754" fill="#596456" font-family="Arial,sans-serif" font-size="15">Revisión ${input.layout.version} · ${input.layout.width} m × ${input.layout.depth} m · ${verified ? "MEDIDAS VERIFICADAS" : "MEDIDAS NO VERIFICADAS"}</text>
  <text x="1130" y="754" text-anchor="end" fill="#6b7368" font-family="Arial,sans-serif" font-size="13">Vista de propuesta · confirma el plano de producción</text>
</svg>`;
  return {
    id: input.id,
    sourceType: input.view,
    sourceId: input.layout.id,
    sourceRevision: input.layout.version,
    title: `${viewLabel} · ${input.layout.name}`,
    caption:
      input.view === "Layout plan"
        ? "Distribución propuesta para el evento."
        : "Vista espacial propuesta para el evento.",
    altText: `${viewLabel} de ${input.layout.name}, revisión ${input.layout.version}`,
    dataUrl: svgUrl(svg),
    mimeType: "image/svg+xml",
    measurementStatus: verified ? "Verified" : "Unverified",
    addedAt: input.addedAt,
  };
}
