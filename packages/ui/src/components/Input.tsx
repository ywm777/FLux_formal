import type {
  CSSProperties,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const fieldBase: CSSProperties = {
  width: "100%",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-md)",
  color: "var(--text-primary)",
  background: "var(--bg-inset)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-2) var(--space-3)",
  outline: "none",
  boxSizing: "border-box",
};

export function Input({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input style={{ ...fieldBase, ...style }} {...rest} />;
}

export function Textarea({
  style,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      style={{ ...fieldBase, resize: "vertical", minHeight: 72, ...style }}
      {...rest}
    />
  );
}

export function Select({
  style,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select style={{ ...fieldBase, ...style }} {...rest} />;
}

export interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}
    >
      <label
        htmlFor={htmlFor}
        style={{
          fontSize: "var(--text-sm)",
          color: "var(--text-muted)",
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      {children}
      {hint && !error ? (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span style={{ fontSize: "var(--text-xs)", color: "var(--danger)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
