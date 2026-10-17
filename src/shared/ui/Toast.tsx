import { Check, TriangleAlert, X } from "lucide-react";
import { uiLabel } from "../i18n";

/** A short confirmation at the bottom of the screen. Announced politely. */
export function Toast({
  message,
  onDismiss,
  tone = "success",
}: {
  message: string;
  onDismiss: () => void;
  tone?: "success" | "danger";
}) {
  return (
    <div className={`toast ${tone}`} role="status" aria-live="polite">
      {tone === "danger" ? (
        <TriangleAlert size={17} aria-hidden="true" />
      ) : (
        <Check size={17} aria-hidden="true" />
      )}
      <span>{message}</span>
      <button
        type="button"
        aria-label={uiLabel("Dismiss notification")}
        onClick={onDismiss}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
