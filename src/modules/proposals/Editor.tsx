import { uiLabel } from "../../shared/i18n";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Eye,
  GitCompare,
  History,
  PencilLine,
  Printer,
  Save,
  Send,
  Sparkles,
} from "lucide-react";
import { Badge, Button, ErrorNote } from "../../shared/ui";
import type { Proposal } from "../../shared/types";
import { useEditorView } from "./editor-view";
import { EditorWorkspace } from "./EditorWorkspace";
import { EditorDialogs } from "./EditorDialogs";
import "./templates/proposal-document.css";

/**
 * The proposal workspace: the document itself, editable in place, with KIT
 * beside it. Preview shows exactly what the client gets; printing uses the
 * same tree.
 */
export function Editor({ original }: { original: Proposal }) {
  const ctx = useEditorView({ original });
  const {
    saving,
    draft,
    error,
    preview,
    setPreview,
    setCompareOpen,
    setCompareId,
    setVersionsOpen,
    assistantOpen,
    setAssistantOpen,
    editable,
    locked,
    client,
    priorVersions,
    dirty,
    save,
    revision,
    setSending,
    setOutgoingMessage,
    event,
    user,
  } = ctx;
  const canSend = !dirty && Boolean(client) && Boolean(user?.isOwner);
  return (
    <div className={`proposal-editor ${preview ? "previewing" : ""}`}>
      <div className="proposal-editor-top no-print">
        <Link className="back-link" to="/proposals">
          <ArrowLeft size={15} aria-hidden="true" />
          {uiLabel("All proposals")}
        </Link>
        <div className="proposal-editor-meta">
          <strong>{draft.number}</strong>
          <span>· v{draft.version}</span>
          <Badge>{original.status}</Badge>
          <span className={`save-state ${dirty ? "dirty" : ""}`}>
            {dirty ? uiLabel("Unsaved changes") : uiLabel("Saved revision")}
          </span>
        </div>
        <div className="proposal-editor-actions">
          <Button
            variant="secondary"
            aria-pressed={preview}
            onClick={() => setPreview(!preview)}
          >
            {preview ? (
              <PencilLine size={16} aria-hidden="true" />
            ) : (
              <Eye size={16} aria-hidden="true" />
            )}
            {preview ? "Editar" : "Vista previa"}
          </Button>
          <Button
            variant="secondary"
            disabled={dirty}
            title={
              dirty
                ? "Guarda los cambios para exportar la versión exacta."
                : undefined
            }
            onClick={() => {
              setPreview(true);
              setTimeout(() => window.print(), 50);
            }}
          >
            <Printer size={16} aria-hidden="true" />
            Exportar PDF
          </Button>
          {priorVersions.length > 0 && (
            <Button
              variant="secondary"
              onClick={() => {
                setCompareId(priorVersions.at(-1)?.id || "");
                setCompareOpen(true);
              }}
            >
              <GitCompare size={16} aria-hidden="true" />
              Comparar versiones
            </Button>
          )}
          <Button variant="secondary" onClick={() => setVersionsOpen(true)}>
            <History size={16} aria-hidden="true" />
            Versiones
          </Button>
          {editable &&
            (locked ? (
              <Button disabled={saving} onClick={revision}>
                <Copy size={16} aria-hidden="true" />
                {uiLabel("New revision")}
              </Button>
            ) : (
              <Button disabled={saving || !dirty} onClick={() => save()}>
                <Save size={16} aria-hidden="true" />
                {uiLabel("Save changes")}
              </Button>
            ))}
          <Button
            variant="secondary"
            disabled={!canSend}
            title={
              !client
                ? "Vincula un evento con cliente para enviar."
                : dirty
                  ? "Guarda los cambios antes de revisar el envío."
                  : !user?.isOwner
                    ? "Solo el propietario envía propuestas."
                    : undefined
            }
            onClick={() => {
              const first = client?.contact.split(" ")[0];
              setOutgoingMessage(
                `Hola${first ? ` ${first}` : ""}, te compartimos la propuesta${event ? ` para ${event.name}` : ""}. Quedamos atentos a tus preguntas.`,
              );
              setSending(true);
            }}
          >
            <Send size={15} aria-hidden="true" />
            {uiLabel("Review & send")}
          </Button>
          <Button
            variant={assistantOpen ? "primary" : "secondary"}
            className="proposal-kit-toggle"
            aria-pressed={assistantOpen}
            onClick={() => setAssistantOpen(!assistantOpen)}
          >
            <Sparkles size={16} aria-hidden="true" />
            KIT
          </Button>
        </div>
      </div>
      {error && <ErrorNote>{error}</ErrorNote>}
      {locked && !preview && (
        <div className="info-note no-print">
          Esta versión se conserva como registro.{" "}
          {editable
            ? "Crea una nueva versión para cambiar su alcance o precios."
            : "Tu acceso a esta propuesta es de solo lectura."}
        </div>
      )}
      <EditorWorkspace ctx={ctx} />
      <EditorDialogs ctx={ctx} />
    </div>
  );
}
