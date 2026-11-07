import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-k-primary-subtle text-k-muted",
        info: "bg-k-info-subtle text-k-info",
        success: "bg-k-success-subtle text-k-success",
        warning: "bg-k-warning-subtle text-k-warning",
        danger: "bg-k-danger-subtle text-k-danger",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Badge({
  className,
  tone,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export const accountTone = {
  active: "success",
  pending: "warning",
  rejected: "danger",
  banned: "danger",
  deleted: "neutral",
} as const;
export const roleTone = {
  user: "neutral",
  admin: "success",
} as const;
