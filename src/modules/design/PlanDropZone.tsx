import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { ImageUp } from "lucide-react";
import { useWorkspace } from "../../shared/store";
import { Button } from "../../shared/ui";

export const RIGHTS_REQUIRED_MESSAGE =
  "Confirma que tienes permiso para usar el plano antes de cargarlo.";

/** Big drop target for the event's 2D floor plan (image). */
export function PlanDropZone({
  title,
  description,
  rightsConfirmed,
  onRightsChange,
  onFile,
  busy = false,
  compact = false,
  children,
}: {
  title: string;
  description: string;
  rightsConfirmed: boolean;
  onRightsChange: (value: boolean) => void;
  onFile: (file: File) => void;
  busy?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  const { toast } = useWorkspace();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  function accept(file?: File) {
    if (!file || busy) return;
    if (!rightsConfirmed) {
      toast(RIGHTS_REQUIRED_MESSAGE);
      return;
    }
    onFile(file);
  }
  function onDragOver(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setOver(true);
  }
  return (
    <section
      className={`plan-drop${compact ? " compact" : ""}${over ? " over" : ""}`}
      aria-busy={busy}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        accept(event.dataTransfer.files[0]);
      }}
    >
      <span className="plan-drop-icon" aria-hidden="true">
        <ImageUp size={compact ? 22 : 30} />
      </span>
      <div className="plan-drop-text">
        {compact ? <strong>{title}</strong> : <h3>{title}</h3>}
        <p>{busy ? "Preparando plano…" : description}</p>
      </div>
      <label className="rights-confirmation">
        <input
          type="checkbox"
          checked={rightsConfirmed}
          onChange={(event) => onRightsChange(event.target.checked)}
        />
        {compact
          ? "Tengo permiso para usar este plano."
          : "Confirmo que tengo permiso para usar y procesar este plano."}
      </label>
      <input
        ref={input}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label="Subir plano 2D"
        onChange={(event) => {
          accept(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <Button
        variant={compact ? "secondary" : "primary"}
        disabled={busy}
        onClick={() =>
          rightsConfirmed
            ? input.current?.click()
            : toast(RIGHTS_REQUIRED_MESSAGE)
        }
      >
        <ImageUp size={15} />
        {busy ? "Preparando…" : "Elegir imagen"}
      </Button>
      {children}
    </section>
  );
}
