import type { CSSProperties, HTMLAttributes } from "react";

export type SurfaceLevel = "base" | "surface" | "elevated";

export interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  level?: SurfaceLevel;
}

const bg: Record<SurfaceLevel, string> = {
  base: "var(--bg-base)",
  surface: "var(--bg-surface)",
  elevated: "var(--bg-elevated)",
};

export function Surface({ level = "surface", style, ...rest }: SurfaceProps) {
  const s: CSSProperties = {
    background: bg[level],
    color: "var(--text-primary)",
    borderRadius: "var(--radius-lg)",
    border: "1px solid var(--border-subtle)",
    ...style,
  };
  return <div style={s} {...rest} />;
}
