import { useState } from "react";
import { FileUp } from "lucide-react";
import { uiLabel } from "../shared/i18n";
import { CSV_IMPORT_LIMIT, type ImportPlan } from "../shared/csv";
import { Button, ErrorNote, Field, Modal } from "../shared/ui";

const MAX_BYTES = 2_000_000;

// Validates a CSV file into an import plan and applies it only after review.
export function CsvImportDialog<T>({
  title,
  description,
  plan: buildPlan,
  label,
  onCommit,
  onClose,
}: {
  title: string;
  description: string;
  plan: (text: string) => ImportPlan<T>;
  label: (record: T) => string;
  onCommit: (plan: ImportPlan<T>) => Promise<boolean>;
  onClose: () => void;
}) {
  const [plan, setPlan] = useState<ImportPlan<T> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const changes = plan ? plan.created.length + plan.updated.length : 0;
  return (
    <Modal title={title} description={description} onClose={onClose}>
      <div className="modal-body">
        {error && <ErrorNote>{error}</ErrorNote>}
        <Field
          label="CSV file"
          hint={`Up to ${CSV_IMPORT_LIMIT} rows. Export the current list to use it as a template.`}
        >
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              setError("");
              setPlan(null);
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > MAX_BYTES) {
                setError(uiLabel("The file is larger than 2 MB."));
                return;
              }
              setPlan(buildPlan(await file.text()));
            }}
          />
        </Field>
        {plan && (
          <div className="csv-preview" aria-live="polite">
            <p className="csv-summary">
              {plan.created.length} nuevos · {plan.updated.length} actualizados
              · {plan.unchanged} sin cambios · {plan.errors.length} errores
            </p>
            {plan.errors.length > 0 && (
              <ErrorNote>
                {uiLabel("Fix these rows and choose the file again:")}
                <ul>
                  {plan.errors.slice(0, 20).map((problem, index) => (
                    <li key={index}>
                      Fila {problem.row}: {problem.message}
                    </li>
                  ))}
                </ul>
                {plan.errors.length > 20 &&
                  `… y ${plan.errors.length - 20} más.`}
              </ErrorNote>
            )}
            {!plan.errors.length && changes > 0 && (
              <ul className="csv-changes">
                {[
                  ...plan.created.map((record) => `Nuevo · ${label(record)}`),
                  ...plan.updated.map(
                    (record) => `Actualizado · ${label(record)}`,
                  ),
                ]
                  .slice(0, 12)
                  .map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                {changes > 12 && <li>… y {changes - 12} más.</li>}
              </ul>
            )}
          </div>
        )}
        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!plan || plan.errors.length > 0 || !changes || busy}
            onClick={async () => {
              if (!plan) return;
              setBusy(true);
              try {
                if (await onCommit(plan)) onClose();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <FileUp size={15} />
            {busy ? "Importing…" : "Import records"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
