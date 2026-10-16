import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { draftGuard } from "../shared/useUnsavedChanges";
import { Modal } from "../shared/ui";
export function DraftNavigation() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<{ run: () => void } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!("__TAURI_INTERNALS__" in window) || window.location.port === "3001")
      return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const win = getCurrentWindow();
      const off = await win.onCloseRequested((event) => {
        event.preventDefault();
        const run = () => {
          window.dispatchEvent(new Event("pagehide"));
          void win.destroy();
        };
        if (draftGuard.dirty) setPending({ run });
        else run();
      });
      if (disposed) off();
      else unlisten = off;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);
  useEffect(() => {
    const request = (e: Event) => {
      const run = (e as CustomEvent<() => void>).detail;
      if (draftGuard.dirty) setPending({ run });
      else run();
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (
        !draftGuard.dirty ||
        !a ||
        a.target === "_blank" ||
        a.download ||
        e.ctrlKey ||
        e.metaKey ||
        a.origin !== window.location.origin ||
        (a.getAttribute("href")?.startsWith("#") && !a.hash.startsWith("#/"))
      )
        return;
      e.preventDefault();
      e.stopPropagation();
      setPending({
        run: () =>
          navigate(
            a.hash.startsWith("#/") ? a.hash.slice(1) : a.pathname + a.search,
          ),
      });
    };
    window.addEventListener("kit:navigate", request);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("kit:navigate", request);
      document.removeEventListener("click", click, true);
    };
  }, [navigate]);
  return (
    pending && (
      <Modal
        title="Cambios sin guardar"
        onClose={() => {
          if (!saving) setPending(null);
        }}
      >
        <div className="modal-body">
          <p>Guarda los cambios antes de cambiar de pestaña o descártalos.</p>
          {error && <p role="alert">{error}</p>}
          <button
            className="button primary"
            disabled={saving || !draftGuard.save}
            onClick={async () => {
              setSaving(true);
              setError("");
              try {
                await draftGuard.save?.();
                await new Promise((resolve) => setTimeout(resolve, 0));
                if (draftGuard.dirty) {
                  setError(
                    "No se guardaron los cambios. Revisa los errores del editor.",
                  );
                  return;
                }
                pending.run();
                setPending(null);
              } catch {
                setError("No se pudieron guardar los cambios.");
              } finally {
                setSaving(false);
              }
            }}
          >
            Guardar y continuar
          </button>
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => {
              draftGuard.dirty = false;
              draftGuard.discard?.();
              pending.run();
              setPending(null);
            }}
          >
            Descartar
          </button>
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => setPending(null)}
          >
            Cancelar
          </button>
        </div>
      </Modal>
    )
  );
}
