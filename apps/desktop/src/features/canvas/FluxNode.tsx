import { Handle, Position, type NodeProps } from "@xyflow/react";
import { carrierColorVar, type CarrierColorKey } from "@flux/ui";

export interface FluxNodeData extends Record<string, unknown> {
  label: string;
  fluxType: string;
  carrier: CarrierColorKey;
  inputs: { id: string; name: string }[];
  outputs: { id: string; name: string }[];
  config: Record<string, unknown>;
}

/** 万能节点统一外框：左侧载体色条 + 标题 + 多端口（见 ui-spec §7） */
export function FluxNode({ data, selected }: NodeProps) {
  const d = data as FluxNodeData;
  const color = carrierColorVar[d.carrier] ?? carrierColorVar.basic;

  return (
    <div
      style={{
        minWidth: 180,
        background: "var(--bg-surface)",
        border: `1px solid ${selected ? "var(--accent)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
        fontFamily: "var(--font-sans)",
        color: "var(--text-primary)",
        boxShadow: selected ? "0 0 0 2px var(--accent)" : undefined,
      }}
    >
      <div style={{ display: "flex" }}>
        <div style={{ width: 3, background: color }} />
        <div style={{ flex: 1, padding: "var(--space-2) var(--space-3)" }}>
          <div style={{ fontSize: "var(--text-md)", fontWeight: 500 }}>
            {d.label}
          </div>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
            {d.fluxType}
          </div>
        </div>
      </div>

      {d.inputs.map((p, i) => (
        <Handle
          key={`in-${p.id}`}
          type="target"
          position={Position.Left}
          id={p.id}
          style={{ top: 44 + i * 16, background: color }}
        />
      ))}
      {d.outputs.map((p, i) => (
        <Handle
          key={`out-${p.id}`}
          type="source"
          position={Position.Right}
          id={p.id}
          style={{ top: 44 + i * 16, background: color }}
        />
      ))}
    </div>
  );
}
