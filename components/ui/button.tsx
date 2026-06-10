import * as React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost" | "destructive";
  size?: "default" | "sm" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-skill-500/30 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-skill-600 text-white hover:bg-skill-700 shadow-sm": variant === "default",
            "border bg-background hover:bg-muted": variant === "outline",
            "hover:bg-muted": variant === "ghost",
            "bg-red-600 text-white hover:bg-red-700": variant === "destructive",
            "h-9 px-4 py-2": size === "default",
            "h-8 px-3 text-xs": size === "sm",
            "h-10 px-6": size === "lg",
          },
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";

export { Button };
