import {
  Box,
  Download,
  FileImage,
  Grid2X2,
  History,
  Layers3,
  RotateCcw,
  Save,
  ScanLine,
} from "lucide-react";
import { Badge, Button, Modal } from "../../shared/ui";
import { downloadFile, layoutSvg } from "../../shared/domain";
import { uiLabel } from "../../shared/i18n";
import type { Layout } from "../../shared/types";
import { layoutDraftKey } from "./helpers";
import { useLayoutEditorView } from "./layout-editor-view";
import { LayoutCanvas } from "./LayoutCanvas";
import { LayoutProperties } from "./LayoutProperties";

export function LayoutEditor({
  original,
  view,
  setView,
}: {
  original: Layout;
  view: string;
  setView: (s: string) => void;
}) {
  const ctx = useLayoutEditorView({ original, view, setView });
  const {
    data,
    toast,
    layout,
    setLayout,
    recovered,
    setRecovered,
    versions,
    setVersions,
    equipmentReview,
    setEquipmentReview,
    past,
    setPast,
    setFuture,
    dirty,
    reconciliation,
    save,
  } = ctx;
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
        <LayoutCanvas ctx={ctx} />
        <LayoutProperties ctx={ctx} />
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
                      cameras: structuredClone(h.cameras),
                      cameraPath: structuredClone(h.cameraPath),
                      provenance: structuredClone(h.provenance),
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
