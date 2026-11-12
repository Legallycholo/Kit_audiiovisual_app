import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Image as ImageIcon } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { Button } from "../../shared/ui";
import { id } from "../../shared/domain";
import type { ProposalVisual } from "../../shared/types";
import type { DesignProject, DesignSummary } from "../../shared/kit-design";
import { createDesignProposalVisual } from "../../shared/proposal-visuals";

/**
 * The applied renders of the event's KIT Design projects, ready to enter the
 * document by reference. Sample ("fixture") renders are offered too but named
 * as such, so a sample never reaches a client unnoticed.
 */
export function DesignRenders({
  eventId,
  visuals,
  onAdd,
}: {
  eventId: string;
  visuals: ProposalVisual[];
  onAdd: (visual: ProposalVisual) => void;
}) {
  const { request } = useWorkspace();
  const [projects, setProjects] = useState<DesignProject[] | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { designs } = await request<{ designs: DesignSummary[] }>(
          `/design/events/${encodeURIComponent(eventId)}/designs`,
        );
        const loaded = await Promise.all(
          designs.map((design) =>
            request<DesignProject>(
              `/design/designs/${encodeURIComponent(design.id)}`,
            ),
          ),
        );
        if (active) setProjects(loaded);
      } catch {
        if (active) setProjects([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [request, eventId]);
  const entries = (projects ?? []).flatMap((project) => {
    const version = project.versions.find(
      (v) => v.id === project.currentVersionId,
    );
    if (!version) return [];
    return version.renders.map((render) => ({ project, version, render }));
  });
  return (
    <div>
      <strong>Renders de KIT Design</strong>
      {projects === null ? (
        <p className="muted">Buscando diseños del evento…</p>
      ) : entries.length ? (
        entries.map(({ project, version, render }) => {
          const added = visuals.some(
            (visual) =>
              visual.sourceType === "KIT Design" &&
              visual.sourceId === render.id,
          );
          const sample = render.provider === "fixture";
          return (
            <div className="proposal-media-option" key={render.id}>
              <img src={render.url} alt="" />
              <span>
                <b>{project.title}</b>
                <small>
                  Versión {version.number}
                  {sample ? " · muestra (no es un render real)" : ""}
                </small>
              </span>
              <Button
                variant="secondary"
                disabled={added}
                onClick={() =>
                  onAdd(
                    createDesignProposalVisual({
                      id: id(),
                      render,
                      designTitle: project.title,
                      versionNumber: version.number,
                      addedAt: new Date().toISOString(),
                    }),
                  )
                }
              >
                <ImageIcon size={14} aria-hidden="true" />
                {added ? "Añadido" : "Añadir"}
              </Button>
            </div>
          );
        })
      ) : (
        <p className="muted">
          Este evento no tiene renders aplicados.{" "}
          <Link to={`/design?event=${eventId}`}>Abrir KIT Design</Link>
        </p>
      )}
    </div>
  );
}
