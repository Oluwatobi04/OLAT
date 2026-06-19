import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        // Primary — blue→purple gradient with glow + lift on hover
        default:
          "bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] text-white shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-purple-500/40 hover:-translate-y-0.5",
        // Secondary — glass with border glow
        secondary:
          "glass text-foreground hover:border-white/20 hover:shadow-lg hover:shadow-blue-500/10",
        // AI action — gradient border + animated pulse
        ai: "relative gradient-border text-foreground animate-ai-pulse hover:-translate-y-0.5",
        outline:
          "border border-white/10 bg-white/5 text-foreground hover:bg-white/10 hover:border-white/20",
        ghost: "text-muted-foreground hover:bg-white/5 hover:text-foreground",
        destructive:
          "bg-destructive text-destructive-foreground shadow-lg shadow-red-500/20 hover:bg-destructive/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-xl px-8 text-base",
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
