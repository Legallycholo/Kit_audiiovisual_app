import { useRef, useState, type DragEvent } from "react";
import { ImagePlus } from "lucide-react";
import { MAX_ROOM_IMAGES } from "../../shared/kit-design";

/** Drop or pick room photos / floor plans. `compact` is the small "add more" variant. */
export function DropZone({
  onFiles,
  busy,
  disabled,
  compact = false,
  remaining = MAX_ROOM_IMAGES,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
  disabled?: boolean;
  compact?: boolean;
  remaining?: number;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const blocked = busy || disabled || remaining <= 0;
  const drop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    if (blocked) return;
    const files = [...event.dataTransfer.files];
    if (files.length) onFiles(files);
  };
  return (
    <div
      className={`kd-drop ${compact ? "compact" : ""} ${over ? "over" : ""}`}
      aria-disabled={blocked}
      onDragOver={(event) => {
        event.preventDefault();
        if (!blocked) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      <ImagePlus size={compact ? 18 : 32} aria-hidden="true" />
      {compact ? (
        <span>Añadir imágenes</span>
      ) : (
        <>
          <strong>Suelta aquí las fotos o el plano del salón</strong>
          <span className="muted">
            JPG, PNG o WebP · hasta {MAX_ROOM_IMAGES} imágenes
          </span>
        </>
      )}
      <button
        type="button"
        className={`button ${compact ? "ghost" : "secondary"}`}
        disabled={blocked}
        onClick={() => input.current?.click()}
      >
        {busy ? "Preparando…" : compact ? "Elegir" : "Elegir imágenes"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        aria-label="Imágenes del salón"
        onChange={(event) => {
          const files = [...(event.target.files || [])];
          event.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </div>
  );
}
