import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-200 ring-1 ring-inset ring-blue-400/20",
        secondary: "border-transparent bg-white/5 text-muted-foreground ring-1 ring-inset ring-white/10",
        destructive: "border-transparent bg-red-500/15 text-red-300 ring-1 ring-inset ring-red-400/20",
        outline: "border-white/10 text-foreground",
        success: "border-transparent bg-emerald-500/15 text-emerald-300 ring-1 ring-inset ring-emerald-400/20",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
