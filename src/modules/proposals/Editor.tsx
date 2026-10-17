import { uiLabel } from "../../shared/i18n";
import { AIReview } from "../ProposalAI";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Sparkles,
  Printer,
  Copy,
  GitCompare,
} from "lucide-react";
import { Badge, Button, ErrorNote, PageHeader } from "../../shared/ui";
import { shortDate } from "../../shared/domain";
import type { Proposal } from "../../shared/types";
import { useEditorView } from "./editor-view";
import { EditorWorkspace } from "./EditorWorkspace";
import { EditorDialogs } from "./EditorDialogs";

export function Editor({ original }: { original: Proposal }) {
  const ctx = useEditorView({ original });
  const {
    saving,
    draft,
    error,
    setPreview,
    setAiOpen,
    setCompareOpen,
    setCompareId,
    editable,
    locked,
    event,
    client,
    priorVersions,
    dirty,
    save,
    revision,
  } = ctx;
  return (
    <>
      <Link className="back-link" to="/proposals">
        <ArrowLeft size={15} />
        {uiLabel("All proposals")}
      </Link>
      <PageHeader
        eyebrow={`${draft.number} · VERSIÓN ${draft.version}`}
        title={draft.title}
        description={`${client?.name} · ${event ? shortDate(event.date) : ""}`}
        actions={
          <>
            <Badge>{original.status}</Badge>
            <Button
              variant="secondary"
              disabled={dirty}
              title={
                dirty
                  ? "Guarda los cambios para previsualizar la versión exacta."
                  : undefined
              }
              onClick={() => setPreview(true)}
            >
              <Printer size={16} />
              {uiLabel("Preview")}
            </Button>
            {priorVersions.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  setCompareId(priorVersions.at(-1)?.id || "");
                  setCompareOpen(true);
                }}
              >
                <GitCompare size={16} />
                Comparar versiones
              </Button>
            )}
            {editable &&
              (locked ? (
                <Button disabled={saving} onClick={revision}>
                  <Copy size={16} />
                  {uiLabel("New revision")}
                </Button>
              ) : (
                <Button disabled={saving} onClick={() => save()}>
                  <Save size={16} />
                  {uiLabel("Save changes")}
                </Button>
              ))}
          </>
        }
      />
      {error && <ErrorNote>{error}</ErrorNote>}
      {locked && (
        <div className="info-note">
          Esta versión se conserva como registro.{" "}
          {editable
            ? "Crea una nueva versión para cambiar su alcance o precios."
            : "Tu acceso a esta propuesta es de solo lectura."}
        </div>
      )}
      {!locked && (
        <div className="proposal-ai-actions">
          <Button variant="secondary" onClick={() => setAiOpen(true)}>
            <Sparkles size={16} />
            Mejorar con IA
          </Button>
        </div>
      )}
      <AIReview review={draft.aiReview} />
      <EditorWorkspace ctx={ctx} />
      <EditorDialogs ctx={ctx} />
    </>
  );
}
