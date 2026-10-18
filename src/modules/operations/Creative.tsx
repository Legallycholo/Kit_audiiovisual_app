import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Download, Image, Sparkles, WandSparkles } from "lucide-react";
import { useWorkspace, activity } from "../../shared/store";
import {
  Badge,
  Button,
  Empty,
  Field,
  PageHeader,
  Panel,
  Tabs,
} from "../../shared/ui";
import { downloadFile, id, shortDate } from "../../shared/domain";
import { canEditCollection } from "../../shared/access";
import { createShowcaseCreativeAsset } from "../../shared/creative";
import { uiLabel } from "../../shared/i18n";
import type { CreativeKind } from "../../shared/types";

export function Creative() {
  const { data, update, toast, user, saving } = useWorkspace();
  const [params] = useSearchParams();
  const [tab, setTab] = useState("Concepts & media");
  const [eventId, setEventId] = useState(
    params.get("event") || data.events[0]?.id || "",
  );
  const [brief, setBrief] = useState("");
  const [kind, setKind] = useState<CreativeKind>("Event concept");
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [selectedAssetId, setSelectedAssetId] = useState(
    params.get("asset") || "",
  );
  useEffect(() => {
    if (params.get("event")) setEventId(params.get("event")!);
    if (params.get("asset")) setSelectedAssetId(params.get("asset")!);
  }, [params]);
  const [revisionParentId, setRevisionParentId] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const assets = data.creativeAssets
    .filter((asset) => asset.eventId === eventId)
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
  const references = data.brandAssets.filter(
    (reference) => reference.eventId === eventId,
  );
  const selectedAsset = data.creativeAssets.find(
    (asset) => asset.id === selectedAssetId,
  );
  const draftProposals = data.proposals.filter(
    (proposal) => proposal.eventId === eventId && proposal.status === "Draft",
  );
  const generationLimit = 20;
  const canCreate = canEditCollection(user, "creativeAssets");
  const canAttach = canEditCollection(user, "proposals");

  const generate = async () => {
    const cleanBrief = brief.trim();
    if (cleanBrief.length < 20) {
      setGenerationError(
        "Add at least 20 characters of creative direction. Your brief has been preserved.",
      );
      return;
    }
    if (assets.length >= generationLimit) {
      setGenerationError(
        "Este evento llegó al límite de bocetos locales. Tu descripción se conserva.",
      );
      return;
    }
    if (kind === "Image edit" && referenceIds.length === 0) {
      setGenerationError(
        "Select at least one authorized reference for an image edit. Your brief has been preserved.",
      );
      return;
    }
    const event = data.events.find((item) => item.id === eventId);
    if (!event) return;
    const parent = revisionParentId
      ? data.creativeAssets.find((asset) => asset.id === revisionParentId)
      : undefined;
    const now = new Date().toISOString();
    const next = createShowcaseCreativeAsset({
      id: id(),
      eventId,
      eventName: event.name,
      kind,
      brief: cleanBrief,
      referenceIds,
      referenceNames: references
        .filter((reference) => referenceIds.includes(reference.id))
        .map((reference) => reference.name),
      referenceDataUrls: references
        .filter((reference) => referenceIds.includes(reference.id))
        .map((reference) => reference.dataUrl),
      generatedAt: now,
      parent,
    });
    if (
      await update((workspace) => ({
        ...workspace,
        creativeAssets: [...workspace.creativeAssets, next],
        activity: [
          activity(
            "Creative concept generated",
            `${next.title}, revision ${next.revision}, is awaiting review.`,
            eventId,
          ),
          ...workspace.activity,
        ],
      }))
    ) {
      setSelectedAssetId(next.id);
      setRevisionParentId("");
      setGenerationError("");
      toast("Concepto local creado y enviado a revisión.");
    }
  };

  const review = async (status: "Approved" | "Rejected") => {
    if (!selectedAsset || selectedAsset.status !== "In review") return;
    const reviewedAt = new Date().toISOString();
    if (
      await update((workspace) => ({
        ...workspace,
        creativeAssets: workspace.creativeAssets.map((asset) =>
          asset.id === selectedAsset.id
            ? { ...asset, status, reviewedAt }
            : asset,
        ),
        activity: [
          activity(
            status === "Approved"
              ? "Creative concept approved"
              : "Creative concept rejected",
            `${selectedAsset.title}, revision ${selectedAsset.revision}.`,
            selectedAsset.eventId,
          ),
          ...workspace.activity,
        ],
      }))
    )
      toast(
        status === "Approved"
          ? "Concepto aprobado para propuestas."
          : "Concepto rechazado y conservado en el historial.",
      );
  };

  const uploadReference = async (file?: File) => {
    if (!file) return;
    if (!rightsConfirmed) {
      toast("Confirma los derechos de uso antes de cargar el archivo.");
      return;
    }
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      toast("Usa una imagen PNG, JPEG o WebP.");
      return;
    }
    if (file.size > 800_000) {
      toast("La referencia debe pesar 800 KB o menos.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () =>
        reject(new Error("The reference could not be read."));
      reader.readAsDataURL(file);
    });
    const reference = {
      id: id(),
      eventId,
      name: file.name,
      mimeType: file.type as "image/png" | "image/jpeg" | "image/webp",
      dataUrl,
      rightsConfirmed: true as const,
      createdAt: new Date().toISOString(),
    };
    if (
      await update((workspace) => ({
        ...workspace,
        brandAssets: [...workspace.brandAssets, reference],
      }))
    ) {
      setReferenceIds((current) => [...current, reference.id]);
      toast("Referencia autorizada guardada.");
    }
  };

  const attachToProposal = async (proposalId: string) => {
    if (!selectedAsset || selectedAsset.status !== "Approved") return;
    if (
      await update((workspace) => ({
        ...workspace,
        proposals: workspace.proposals.map((proposal) =>
          proposal.id === proposalId
            ? {
                ...proposal,
                creativeAssetIds: [
                  ...new Set([
                    ...(proposal.creativeAssetIds || []),
                    selectedAsset.id,
                  ]),
                ],
              }
            : proposal,
        ),
        activity: [
          activity(
            "Creative concept attached",
            `${selectedAsset.title}, revision ${selectedAsset.revision}, was attached to a draft proposal.`,
            selectedAsset.eventId,
          ),
          ...workspace.activity,
        ],
      }))
    )
      toast("Concepto adjuntado a la propuesta borrador.");
  };

  return (
    <>
      <PageHeader
        title="AI Creative Studio"
        actions={<Badge tone="neutral">Boceto local · sin IA ni costo</Badge>}
      />
      <Tabs
        items={["Concepts & media", "Brand assets", "Selected for proposals"]}
        value={tab}
        onChange={setTab}
      />
      {tab === "Concepts & media" ? (
        <div className="creative-workspace">
          <Panel title="Your creative brief">
            <div className="panel-body">
              <Field label="Connected event">
                <select
                  value={eventId}
                  onChange={(e) => {
                    setEventId(e.target.value);
                    setSelectedAssetId("");
                    setReferenceIds([]);
                    setRevisionParentId("");
                  }}
                >
                  {data.events.map((e) => (
                    <option value={e.id} key={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="What are we creating?">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as CreativeKind)}
                >
                  {[
                    ["Event concept", "Concepto del evento"],
                    ["Stage concept", "Concepto de escenario"],
                    ["Lighting concept", "Concepto de iluminación"],
                    ["Promotional visual", "Visual promocional"],
                    ["Image edit", "Edición de imagen"],
                  ].map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Creative direction">
                <textarea
                  rows={7}
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder={uiLabel(
                    "The mood, the palette, the audience. Tell us what you have in mind…",
                  )}
                />
              </Field>
              {references.length > 0 && (
                <fieldset className="creative-reference-picker">
                  <legend>Authorized references</legend>
                  {references.map((reference) => (
                    <label key={reference.id}>
                      <input
                        type="checkbox"
                        checked={referenceIds.includes(reference.id)}
                        onChange={(e) =>
                          setReferenceIds((current) =>
                            e.target.checked
                              ? [...current, reference.id]
                              : current.filter((item) => item !== reference.id),
                          )
                        }
                      />
                      {reference.name}
                    </label>
                  ))}
                </fieldset>
              )}
              <div className="connection-note">
                <Sparkles size={20} />
                <div>
                  <strong>Boceto local</strong>
                  <p>
                    Crea un boceto SVG rotulado en este equipo, sin enviar nada
                    a servicios externos. Úsalo para alinear la idea antes de
                    producir la pieza final.
                  </p>
                </div>
              </div>
              {revisionParentId && (
                <div className="info-note">
                  La próxima generación será una revisión del concepto
                  seleccionado.
                </div>
              )}
              {generationError && (
                <div className="error-note" role="alert">
                  {uiLabel(generationError)}
                </div>
              )}
              <div className="creative-actions">
                <Button
                  disabled={
                    !canCreate || saving || assets.length >= generationLimit
                  }
                  onClick={() => void generate()}
                >
                  <WandSparkles size={16} />
                  Generar boceto local
                </Button>
                <Button
                  variant="secondary"
                  disabled={!brief.trim()}
                  onClick={() => {
                    downloadFile(
                      "creative-brief.txt",
                      `Event: ${data.events.find((e) => e.id === eventId)?.name}\nType: ${kind}\n\n${brief}`,
                      "text/plain",
                    );
                    toast("Creative brief exported.");
                  }}
                >
                  <Download size={16} />
                  Export creative brief
                </Button>
              </div>
              <small className="creative-usage">
                Uso local: {assets.length}/{generationLimit} conceptos · costo
                estimado: $0.00 · ninguna API externa
              </small>
            </div>
          </Panel>
          <section className="creative-gallery" aria-label="Concept gallery">
            {assets.length === 0 ? (
              <div className="creative-canvas">
                <span className="creative-orbit orbit-one" />
                <span className="creative-orbit orbit-two" />
                <span className="creative-orbit orbit-three" />
                <div>
                  <WandSparkles size={36} />
                  <h2>{uiLabel("It starts with an idea.")}</h2>
                  <p>
                    Aquí aparecen tus bocetos, listos para revisar, ajustar y
                    usar en la próxima propuesta.
                  </p>
                  <div className="creative-tags">
                    <span>
                      <Image size={14} />
                      Imágenes
                    </span>
                    <span>
                      <Sparkles size={14} />
                      Conceptos
                    </span>
                  </div>
                </div>
                <small>
                  Los visuales creativos no reemplazan los planos con medidas de
                  producción.
                </small>
              </div>
            ) : (
              <>
                <div className="creative-gallery-grid">
                  {assets.map((asset) => (
                    <button
                      key={asset.id}
                      className={`creative-card ${selectedAssetId === asset.id ? "selected" : ""}`}
                      onClick={() => setSelectedAssetId(asset.id)}
                      aria-label={`Seleccionar ${asset.title}, revisión ${asset.revision}`}
                    >
                      <img src={asset.dataUrl} alt="" />
                      <span>
                        <strong>{asset.title}</strong>
                        <small>
                          Rev. {asset.revision} · {asset.status}
                        </small>
                      </span>
                    </button>
                  ))}
                </div>
                {selectedAsset && (
                  <Panel
                    title={selectedAsset.title}
                    subtitle={`Revisión ${selectedAsset.revision} · ${providerName(selectedAsset.provider)} / ${selectedAsset.model}`}
                  >
                    <div className="creative-review panel-body">
                      <img
                        src={selectedAsset.dataUrl}
                        alt={selectedAsset.title}
                      />
                      <div className="creative-provenance">
                        <Badge>{selectedAsset.status}</Badge>
                        <strong>
                          {selectedAsset.provider === "Local showcase"
                            ? "BOCETO LOCAL · SIN IA"
                            : "CONCEPTO GENERADO CON IA"}
                        </strong>
                        <p>{selectedAsset.brief}</p>
                        <small>
                          {selectedAsset.referenceIds.length} referencia(s) · 1
                          unidad · $0.00 ·{" "}
                          {new Date(selectedAsset.generatedAt).toLocaleString()}
                        </small>
                      </div>
                      <div className="creative-actions">
                        {selectedAsset.status === "In review" && canCreate && (
                          <>
                            <Button onClick={() => void review("Approved")}>
                              Aprobar concepto
                            </Button>
                            <Button
                              variant="danger"
                              onClick={() => void review("Rejected")}
                            >
                              Rechazar
                            </Button>
                          </>
                        )}
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setBrief(selectedAsset.brief);
                            setKind(selectedAsset.kind);
                            setReferenceIds(selectedAsset.referenceIds);
                            setRevisionParentId(selectedAsset.id);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Crear revisión
                        </Button>
                        <Button
                          variant="secondary"
                          onClick={() =>
                            downloadFile(
                              `creative-${selectedAsset.id}-r${selectedAsset.revision}.svg`,
                              decodeURIComponent(
                                selectedAsset.dataUrl.split(",")[1],
                              ),
                              "image/svg+xml",
                            )
                          }
                        >
                          <Download size={16} />
                          Descargar
                        </Button>
                      </div>
                      {selectedAsset.status === "Approved" && (
                        <div className="creative-attach">
                          <Field label="Attach to draft proposal">
                            <select
                              defaultValue=""
                              disabled={
                                !canAttach || draftProposals.length === 0
                              }
                              onChange={(e) => {
                                if (e.target.value)
                                  void attachToProposal(e.target.value);
                                e.target.value = "";
                              }}
                            >
                              <option value="">Seleccionar propuesta…</option>
                              {draftProposals.map((proposal) => (
                                <option value={proposal.id} key={proposal.id}>
                                  {proposal.number} · v{proposal.version}
                                </option>
                              ))}
                            </select>
                          </Field>
                          {draftProposals.length === 0 && (
                            <small>
                              No hay una propuesta borrador para este evento.
                            </small>
                          )}
                        </div>
                      )}
                    </div>
                  </Panel>
                )}
              </>
            )}
          </section>
        </div>
      ) : tab === "Brand assets" ? (
        <div className="creative-library">
          <Panel
            title="Authorized brand references"
            subtitle="PNG, JPEG or WebP · maximum 800 KB per file"
          >
            <div className="panel-body">
              <Field label="Connected event">
                <select
                  value={eventId}
                  onChange={(e) => setEventId(e.target.value)}
                >
                  {data.events.map((event) => (
                    <option value={event.id} key={event.id}>
                      {event.name}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={rightsConfirmed}
                  onChange={(e) => setRightsConfirmed(e.target.checked)}
                />
                Confirmo que la empresa tiene derecho a usar esta referencia.
              </label>
              <input
                type="file"
                aria-label="Cargar referencia de marca"
                accept="image/png,image/jpeg,image/webp"
                disabled={!canEditCollection(user, "brandAssets") || saving}
                onChange={(e) => {
                  void uploadReference(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
          </Panel>
          <div className="creative-reference-grid">
            {references.map((reference) => (
              <figure key={reference.id}>
                <img src={reference.dataUrl} alt={reference.name} />
                <figcaption>
                  <strong>{reference.name}</strong>
                  <small>
                    Derechos confirmados · {shortDate(reference.createdAt)}
                  </small>
                </figcaption>
              </figure>
            ))}
            {references.length === 0 && (
              <Empty
                title="Every brand has a story"
                description="Upload an authorized visual reference for this event."
              />
            )}
          </div>
        </div>
      ) : (
        <div className="creative-selected-list">
          {data.proposals
            .filter((proposal) => proposal.creativeAssetIds?.length)
            .map((proposal) => (
              <Panel
                key={proposal.id}
                title={`${proposal.number} · v${proposal.version}`}
                subtitle={
                  data.events.find((event) => event.id === proposal.eventId)
                    ?.name
                }
              >
                <div className="creative-gallery-grid panel-body">
                  {(proposal.creativeAssetIds || []).map((assetId) => {
                    const asset = data.creativeAssets.find(
                      (item) => item.id === assetId,
                    );
                    return asset ? (
                      <div className="creative-card" key={asset.id}>
                        <img src={asset.dataUrl} alt={asset.title} />
                        <span>
                          <strong>{asset.title}</strong>
                          <small>Rev. {asset.revision}</small>
                        </span>
                      </div>
                    ) : null;
                  })}
                </div>
              </Panel>
            ))}
          {!data.proposals.some(
            (proposal) => proposal.creativeAssetIds?.length,
          ) && (
            <Empty
              title="Only your best work goes forward"
              description="Approved concepts attached to draft proposals will appear here."
            />
          )}
        </div>
      )}
    </>
  );
}

/** The local generator keeps its stored id; people see an honest name. */
function providerName(provider: string) {
  return provider === "Local showcase" ? "Boceto local" : provider;
}
