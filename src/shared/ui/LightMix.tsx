import { uiLabel } from "../i18n";

/**
 * Signature motion "Mezcla de luz": a red, a green and a blue dot drift
 * together and blend into one light. Used only while KIT is thinking.
 * Reduced motion shows three still dots; with motion off it is text only.
 */
export function LightMix({
  label = "KIT está pensando…",
  showLabel = false,
  className = "",
}: {
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <span className={`lightmix ${className}`} role="status" aria-live="polite">
      <span className="lightmix-dots" aria-hidden="true">
        <span className="lightmix-dot r" />
        <span className="lightmix-dot g" />
        <span className="lightmix-dot b" />
      </span>
      <span className={`lightmix-label ${showLabel ? "" : "is-hidden"}`}>
        {uiLabel(label)}
      </span>
    </span>
  );
}
