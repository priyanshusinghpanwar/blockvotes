import * as React from "react"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | "accent"
  size?: "default" | "sm" | "lg" | "icon"
  isLoading?: boolean
}

const variantClasses = {
  default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20",
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
  outline: "border-2 border-input bg-background hover:bg-accent/5 hover:text-accent-foreground hover:border-accent/30",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  ghost: "hover:bg-accent/10 hover:text-accent",
  link: "text-primary underline-offset-4 hover:underline",
  accent: "bg-accent text-accent-foreground hover:bg-accent/90 shadow-md shadow-accent/20",
}

const sizeClasses = {
  default: "h-11 px-5 py-2",
  sm: "h-9 rounded-md px-3 text-xs",
  lg: "h-14 rounded-xl px-8 text-lg font-semibold",
  icon: "h-11 w-11",
}

export function buttonVariants(opts?: { variant?: ButtonProps["variant"]; size?: ButtonProps["size"] }) {
  const variant = opts?.variant ?? "default"
  const size = opts?.size ?? "default"
  return cn(
    "inline-flex items-center justify-center rounded-lg font-medium transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    variantClasses[variant],
    sizeClasses[size],
  )
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", isLoading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export { Button }
