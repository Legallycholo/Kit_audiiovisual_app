import { uiLabel } from "./i18n";
import {
  Children,
  useEffect,
  useId,
  useRef,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import {
  ArrowUpRight,
  ChevronRight,
  Search,
  X,
  FolderOpen,
  Plus,
} from "lucide-react";
import { Link } from "react-router-dom";

function localize(children: ReactNode) {
  return Children.map(children, (child) => {
    if (typeof child !== "string") return child;
    const label = child.trim();
    return label ? child.replace(label, uiLabel(label)) : child;
  });
}

export function Button({
  children,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button {...props} className={`button ${variant} ${props.className || ""}`}>
      {localize(children)}
    </button>
  );
}
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
      <div>
        {eyebrow && <div className="eyebrow">{uiLabel(eyebrow)}</div>}
        <h1>{uiLabel(title)}</h1>
        {description && <p>{uiLabel(description)}</p>}
      </div>
      <div className="header-actions">{actions}</div>
    </header>
  );
}
export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const value = String(children).toLowerCase();
  const color =
    tone ||
    (/accepted|confirmed|available|completed|ready/.test(value)
      ? "green"
      : /pending|review|preparation|hold/.test(value)
        ? "amber"
        : /declined|cancelled|unavailable/.test(value)
          ? "red"
          : /planning|draft/.test(value)
            ? "blue"
            : "neutral");
  return (
    <span className={`badge ${color}`}>
      <span className="badge-dot" />
      {typeof children === "string" ? uiLabel(children) : children}
    </span>
  );
}
export function Avatar({
  label,
  color = "sage",
  small = false,
}: {
  label: string;
  color?: string;
  small?: boolean;
}) {
  return (
    <span className={`avatar ${color} ${small ? "small" : ""}`}>{label}</span>
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
export function TextLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={to}>
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FolderOpen size={28} />
      </span>
      <h3>{uiLabel(title)}</h3>
      <p>{uiLabel(description)}</p>
      {action}
    </div>
  );
}
export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="search-field">
      <Search size={17} />
      <input
        aria-label={uiLabel(placeholder)}
        placeholder={uiLabel(placeholder)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
export function Tabs({
  items,
  value,
  onChange,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="tabs" role="tablist">
      {items.map((item) => (
        <button
          role="tab"
          aria-selected={value === item}
          className={value === item ? "active" : ""}
          key={item}
          onClick={() => onChange(item)}
        >
          {uiLabel(item)}
        </button>
      ))}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{uiLabel(label)}</span>
      {children}
      {hint && <small>{uiLabel(hint)}</small>}
    </label>
  );
}
export function Modal({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id={titleId}>{uiLabel(title)}</h2>
          {description && <p>{uiLabel(description)}</p>}
        </div>
        <button
          className="icon-button"
          aria-label={uiLabel("Close dialog")}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Placeholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="future-note">
      <Plus size={18} />
      <div>
        <strong>{uiLabel(title)}</strong>
        <p>{uiLabel(description)}</p>
      </div>
      <ChevronRight size={18} />
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
  detail: ReactNode;
  icon: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">
        {label}
        <span>{icon}</span>
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-detail">{detail}</div>
    </div>
  );
}
