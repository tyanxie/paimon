import type { ComponentPropsWithRef } from "react";
import { LoaderCircle } from "lucide-react";

interface ButtonProps extends ComponentPropsWithRef<"button"> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "regular" | "icon" | "compact" | "inline" | "badge";
  loading?: boolean;
}

export function Button({
  variant = "ghost",
  size = "regular",
  loading = false,
  disabled,
  type = "button",
  className = "",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"] || undefined}
      className={`ui-button ui-button--${variant} ui-button--${size} ${className}`}
    >
      {loading && (
        <LoaderCircle
          size={16}
          className="animate-spin shrink-0"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
