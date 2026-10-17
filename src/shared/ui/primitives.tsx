import {
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";
import { uiLabel } from "../i18n";
import { isApplePlatform, localize } from "./localize";

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

const toneFor = (value: string) =>
  /accepted|confirmed|available|completed|ready|conectad|listo/.test(value)
    ? "green"
    : /pending|review|preparation|hold|pendiente/.test(value)
      ? "amber"
      : /declined|cancelled|unavailable|error|rechaz/.test(value)
        ? "red"
        : /planning|draft|borrador/.test(value)
          ? "blue"
          : "neutral";

export function Badge({
  children,
  tone,
}: {
  children: ReactNode;
  tone?: string;
}) {
  const color = tone || toneFor(String(children).toLowerCase());
  return (
    <span className={`badge ${color}`}>
      <span className="badge-dot" aria-hidden="true" />
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
      <ArrowUpRight size={15} aria-hidden="true" />
    </Link>
  );
}

/** A keyboard shortcut. "mod" renders as ⌘ on Apple devices and Ctrl elsewhere. */
export function Kbd({
  keys,
  children,
}: {
  keys?: string[];
  children?: ReactNode;
}) {
  const apple = isApplePlatform();
  const names: Record<string, string> = {
    mod: apple ? "⌘" : "Ctrl",
    shift: apple ? "⇧" : "Shift",
    alt: apple ? "⌥" : "Alt",
    enter: "↵",
    esc: "Esc",
  };
  if (!keys) return <kbd className="kbd">{children}</kbd>;
  return (
    <kbd className="kbd">
      {keys
        .map((key) => names[key.toLowerCase()] ?? key)
        .join(apple ? "" : "+")}
    </kbd>
  );
}

export type StatusTone = "success" | "info" | "danger" | "warning" | "neutral";

/**
 * A small status indicator with an accessible label. Changing `pulseKey`
 * plays the single "saved" glow from the light-mix signature motion.
 */
export function StatusDot({
  tone,
  label,
  pulseKey,
  className = "",
}: {
  tone: StatusTone;
  label: string;
  pulseKey?: string | number;
  className?: string;
}) {
  const [pulsing, setPulsing] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (pulseKey === undefined) return;
    setPulsing(true);
    const timeout = setTimeout(() => setPulsing(false), 400);
    return () => clearTimeout(timeout);
  }, [pulseKey]);
  return (
    <span
      className={`status-dot ${tone} ${pulsing ? "pulsing" : ""} ${className}`}
      role="img"
      aria-label={label}
    />
  );
}

/** Loading placeholder shape. Hidden from assistive technology. */
export function Skeleton({
  width = "100%",
  height = 14,
  radius = "var(--radius-xs)",
  lines = 1,
}: {
  width?: CSSProperties["width"];
  height?: CSSProperties["height"];
  radius?: string;
  lines?: number;
}) {
  return (
    <span className="skeleton-group" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className="skeleton"
          style={{
            width: index === lines - 1 && lines > 1 ? "70%" : width,
            height,
            borderRadius: radius,
          }}
        />
      ))}
    </span>
  );
}
