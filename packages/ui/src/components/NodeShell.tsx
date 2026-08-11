import type { CSSProperties, ReactNode } from "react";
import { carrierColorVar, type CarrierColorKey } from "../tokens/index.js";

export type NodeShellVariant = "compact" | "card" | "mini";

export interface NodeShellProps {
  label: string;
  subtitle?: string;
  carrier?: CarrierColorKey;
  variant?: NodeShellVariant;
  selected?: boolean;
  /** 缩放 <40% 时自动切换 mini（ui-spec §7.2） */
  zoom?: number;
  children?: ReactNode;
}

const sizes: Record<NodeShellVariant, { minWidth: number; pad: string; title: string; sub: string }> = {
  compact: { minWidth: 160, pad: "var(--space-2) var(--space-3)", title: "var(--text-md)", sub: "var(--text-xs)" },
  card: { minWidth: 220, pad: "var(--space-3) var(--space-4)", title: "var(--text-lg)", sub: "var(--text-sm)" },
  mini: { minWidth: 72, pad: "var(--space-1) var(--space-2)", title: "var(--text-xs)", sub: "var(--text-xs)" },
};

/** 万能节点统一外框三形态 */
export function NodeShell({
  label,
  subtitle,
  carrier = "basic",
  variant = "compact",
  selected,
  zoom,
  children,
}: NodeShellProps) {
  const resolved: NodeShellVariant =
    zoom !== undefined && zoom < 0.4 ? "mini" : variant;
  const size = sizes[resolved];
  const color = carrierColorVar[carrier] ?? carrierColorVar.basic;

  const shell: CSSProperties = {
    minWidth: size.minWidth,
    background: "var(--bg-surface)",
    border: `1px solid ${selected ? "var(--accent)" : "var(--border-subtle)"}`,
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    fontFamily: "var(--font-sans)",
    color: "var(--text-primary)",
    boxShadow: selected ? "var(--shadow-node-selected)" : undefined,
  };

  if (resolved === "mini") {
    return (
      <div style={shell}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: size.pad }}>
          <span style={{ width: 6, height: 6, borderRadius: "var(--radius-full)", background: color }} />
          <span style={{ fontSize: size.title, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>
            {label.slice(0, 8)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={{ display: "flex" }}>
        <div style={{ width: 3, background: color }} />
        <div style={{ flex: 1, padding: size.pad }}>
          <div style={{ fontSize: size.title, fontWeight: 500 }}>{label}</div>
          {subtitle ? (
            <div style={{ fontSize: size.sub, color: "var(--text-muted)" }}>{subtitle}</div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
