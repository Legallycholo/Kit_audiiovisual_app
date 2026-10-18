import type { CreativeAsset, CreativeKind } from "./types";

const palettes: Record<CreativeKind, [string, string, string]> = {
  "Event concept": ["#24352b", "#97aa7c", "#ead9bd"],
  "Stage concept": ["#171c24", "#536b8d", "#d9b46f"],
  "Lighting concept": ["#221b34", "#7a5b9e", "#e7b85f"],
  "Promotional visual": ["#432d30", "#c06a58", "#f2d5ae"],
  "Image edit": ["#263536", "#668c89", "#ddd8c7"],
};

const escapeXml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

export function createShowcaseCreativeAsset(input: {
  id: string;
  eventId: string;
  eventName: string;
  kind: CreativeKind;
  brief: string;
  referenceIds: string[];
  referenceNames: string[];
  referenceDataUrls?: string[];
  generatedAt: string;
  parent?: CreativeAsset;
}): CreativeAsset {
  const [dark, middle, light] = palettes[input.kind];
  const revision = input.parent ? input.parent.revision + 1 : 1;
  const title = `${input.kind} · ${input.eventName}`;
  const brief = input.brief.trim();
  const summary = brief.length > 170 ? `${brief.slice(0, 167)}…` : brief;
  const references = input.referenceNames.length
    ? `References: ${input.referenceNames.join(", ")}`
    : "No uploaded references";
  const sourceLayer =
    input.kind === "Image edit" && input.referenceDataUrls?.[0]
      ? `<image href="${escapeXml(input.referenceDataUrls[0])}" width="1200" height="800" preserveAspectRatio="xMidYMid slice" opacity=".62"/><rect width="1200" height="800" fill="url(#background)" opacity=".56"/>`
      : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="Generated event concept">
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${dark}"/><stop offset="1" stop-color="${middle}"/></linearGradient>
    <radialGradient id="glow"><stop stop-color="${light}" stop-opacity=".9"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#background)"/>
  ${sourceLayer}
  <circle cx="930" cy="190" r="360" fill="url(#glow)"/>
  <path d="M0 625 Q280 455 560 625 T1200 600 V800 H0Z" fill="${dark}" opacity=".72"/>
  <path d="M170 610 L420 285 L675 610Z" fill="none" stroke="${light}" stroke-width="5" opacity=".72"/>
  <rect x="425" y="382" width="445" height="225" rx="12" fill="${light}" opacity=".14" stroke="${light}" stroke-width="3"/>
  <g fill="#fff" font-family="Inter, Arial, sans-serif">
    <text x="72" y="88" font-size="22" letter-spacing="5" opacity=".78">LOCAL SHOWCASE · CONCEPT</text>
    <text x="72" y="150" font-size="42" font-weight="700">${escapeXml(input.eventName)}</text>
    <text x="72" y="195" font-size="24" opacity=".8">${escapeXml(input.kind)} · revision ${revision}</text>
    <foreignObject x="72" y="660" width="780" height="95"><div xmlns="http://www.w3.org/1999/xhtml" style="font: 20px Inter,Arial,sans-serif;color:white;line-height:1.4">${escapeXml(summary)}</div></foreignObject>
    <text x="72" y="770" font-size="15" opacity=".68">${escapeXml(references)}</text>
  </g>
  <text x="1128" y="748" text-anchor="end" fill="#fff" opacity=".7" font-family="Inter,Arial,sans-serif" font-size="15">Solo visualización · no es geometría de producción</text>
</svg>`;
  return {
    id: input.id,
    eventId: input.eventId,
    kind: input.kind,
    title,
    brief,
    revision,
    parentId: input.parent?.id,
    status: "In review",
    dataUrl: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    mimeType: "image/svg+xml",
    referenceIds: [...new Set(input.referenceIds)],
    provider: "Local showcase",
    model: "local-concept-v1",
    generatedAt: input.generatedAt,
    usageUnits: 1,
    estimatedCost: 0,
  };
}
