import type { ReactNode } from "react";
import { FolderOpen } from "lucide-react";
import { uiLabel } from "../i18n";
import { localize } from "./localize";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <div className="eyebrow">{uiLabel(eyebrow)}</div>}
        <h1>{uiLabel(title)}</h1>
        {description && <p>{uiLabel(description)}</p>}
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <div>
            <h2>{uiLabel(title)}</h2>
            {subtitle && <p>{uiLabel(subtitle)}</p>}
          </div>
          {action}
        </div>
      )}
      {localize(children)}
    </section>
  );
}

/** The single empty state: icon, title, one sentence and at most one action. */
export function Empty({
  title,
  description,
  action,
  icon,
  compact = false,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={`empty ${compact ? "compact" : ""}`}>
      <span className="empty-icon" aria-hidden="true">
        {icon ?? <FolderOpen size={26} />}
      </span>
      <h3>{uiLabel(title)}</h3>
      <p>{uiLabel(description)}</p>
      {action}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="error-note" role="alert">
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {uiLabel(label)}
        <span aria-hidden="true">{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      {detail && <div className="stat-detail">{detail}</div>}
    </div>
  );
}
