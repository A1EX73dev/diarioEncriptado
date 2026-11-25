import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "ghost-danger";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-sunken",
  ghost: "text-text hover:bg-surface-sunken",
  danger: "bg-danger text-on-accent hover:opacity-90",
  "ghost-danger": "text-danger hover:bg-danger-surface",
};

export function buttonClasses(variant: Variant = "primary", extra = "") {
  return [
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium",
    "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    VARIANTS[variant],
    extra,
  ].join(" ");
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Muestra el texto de carga y desactiva el botón. */
  pending?: boolean;
  pendingLabel?: string;
}

export function Button({
  variant = "primary",
  pending = false,
  pendingLabel = "Un momento…",
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, className)}
      disabled={disabled || pending}
      aria-disabled={disabled || pending}
      {...props}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
