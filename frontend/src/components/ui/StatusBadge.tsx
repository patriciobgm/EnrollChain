import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
  {
    variants: {
      tone: {
        neutral: "border-line bg-canvas text-muted",
        pending: "border-amber-200 bg-amber-50 text-amber-900",
        success: "border-emerald-200 bg-emerald-50 text-emerald-900",
        danger: "border-red-200 bg-red-50 text-red-800",
        info: "border-sky-200 bg-sky-50 text-sky-900",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);
export function StatusBadge({
  tone,
  className,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
