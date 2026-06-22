import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        // Primary — premium blue gradient, subtle shadow, hover lift + slight scale
        default:
          "bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_2px_8px_rgba(37,99,235,0.25)] hover:shadow-[0_6px_18px_rgba(37,99,235,0.35)] hover:-translate-y-0.5 hover:scale-[1.02] active:scale-100",
        // Secondary — clean white with light border
        secondary:
          "bg-white text-foreground border border-border hover:bg-[#F8FAFC] hover:border-[#CBD5E1] shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        outline:
          "border border-border bg-white text-foreground hover:bg-[#F8FAFC] hover:border-[#CBD5E1]",
        ghost: "text-muted-foreground hover:bg-[#F1F5F9] hover:text-foreground",
        destructive:
          "bg-[#EF4444] text-white shadow-[0_2px_8px_rgba(239,68,68,0.25)] hover:bg-[#DC2626] hover:-translate-y-0.5",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-11 px-5 py-2",
        sm: "h-9 rounded-lg px-3.5",
        lg: "h-12 rounded-[14px] px-7 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
