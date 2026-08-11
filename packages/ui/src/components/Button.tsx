import { forwardRef, type ButtonHTMLAttributes, type CSSProperties } from "react";

export type ButtonVariant = "primary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const base: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-md)",
  fontWeight: 500,
  padding: "var(--space-2) var(--space-4)",
  borderRadius: "var(--radius-md)",
  border: "1px solid transparent",
  cursor: "pointer",
  transition: "background var(--motion-fast) var(--ease-standard)",
};

const variants: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--accent)", color: "var(--text-inverse)" },
  ghost: {
    background: "transparent",
    color: "var(--text-primary)",
    borderColor: "var(--border-subtle)",
  },
  danger: { background: "var(--danger)", color: "var(--text-inverse)" },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", style, ...rest },
  ref,
) {
  return <button ref={ref} style={{ ...base, ...variants[variant], ...style }} {...rest} />;
});
