import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <h1 className="font-k-heading text-2xl font-semibold">{title}</h1>
        {description && <p className="text-sm text-k-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="grid justify-items-center gap-3 px-4 py-10 text-center">
      <p className="text-sm text-k-muted">{title}</p>
      {action}
    </div>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="grid min-h-40 place-items-center text-sm text-k-muted"
    >
      {label}
    </div>
  );
}
