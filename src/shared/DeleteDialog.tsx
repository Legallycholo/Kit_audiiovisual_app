import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useWorkspace } from "./store";
import { uiLabel } from "./i18n";
import { Button, ErrorNote, Modal } from "./ui";

/**
 * The confirmation every list uses before deleting a record: names the record,
 * says it cannot be undone and shows the server's reason when it refuses
 * (for example, "has events attached"). `path` is the DELETE route under /api.
 */
export function DeleteDialog({
  title,
  name,
  note,
  path,
  confirmLabel,
  done,
  onClose,
}: {
  title: string;
  name: string;
  note?: string;
  path: string;
  confirmLabel: string;
  /** Toast shown after the record is gone. */
  done: string;
  onClose: () => void;
}) {
  const { request, refresh, toast } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await request(path, { method: "DELETE" });
      await refresh();
      toast(done);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={title}
      description="Esta acción no se puede deshacer."
      onClose={() => !busy && onClose()}
    >
      <div className="modal-body">
        <p>
          Se eliminará de forma permanente <strong>{name}</strong>.
          {note ? ` ${note}` : ""}
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <div className="modal-actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            {uiLabel("Cancel")}
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => void confirm()}
          >
            <Trash2 size={16} aria-hidden="true" />
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
