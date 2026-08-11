import { Drawer, Field, Input, SchemaForm, type FormValue } from "@flux/ui";
import type { Node } from "@xyflow/react";
import {
  getCarrierLabel,
  getNodeTypeName,
  getNodeTypeSummary,
} from "../../lib/nodeDisplay.js";
import { registry } from "../../lib/registry.js";
import { toFormSchema } from "../../lib/schemaBridge.js";
import type { FluxNodeData } from "./FluxNode.js";

export interface NodeInspectorProps {
  node: Node<FluxNodeData>;
  onClose: () => void;
  onLabelChange: (label: string) => void;
  onConfigChange: (config: FormValue) => void;
}

const META: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--text-muted)",
};

export function NodeInspector({
  node,
  onClose,
  onLabelChange,
  onConfigChange,
}: NodeInspectorProps) {
  const def = registry.resolve(node.data.fluxType);
  const formSchema = toFormSchema(def?.configSchema);
  const hasConfig = Object.keys(formSchema.fields).length > 0;

  return (
    <Drawer
      open
      onClose={onClose}
      title="高级设置"
      width={360}
      variant="overlay"
      ariaLabel="节点高级设置"
    >
      <div
        data-canvas-shortcuts="ignore"
        onKeyDownCapture={(event) => {
          if (event.key === "Delete" || event.key === "Backspace") {
            event.stopPropagation();
          }
        }}
        style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
      >
        <div style={identityBlockStyle}>
          <span style={typeLabelStyle}>{getNodeTypeName(node.data.fluxType)}</span>
          <span style={META}>{getNodeTypeSummary(node.data.fluxType)}</span>
        </div>

        <Field label="节点名称" htmlFor="node-label">
          <Input
            id="node-label"
            value={node.data.label}
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </Field>

        <div style={metaGridStyle}>
          <div style={metaItemStyle}>
            <span style={META}>能力</span>
            <strong style={metaValueStyle}>{getCarrierLabel(node.data.carrier)}</strong>
          </div>
          <div style={metaItemStyle}>
            <span style={META}>连接</span>
            <strong style={metaValueStyle}>
              {node.data.inputs.length} 个输入 / {node.data.outputs.length} 个输出
            </strong>
          </div>
        </div>

        <div style={dividerStyle} />

        {hasConfig ? (
          <SchemaForm
            schema={formSchema}
            value={node.data.config}
            onChange={onConfigChange}
          />
        ) : (
          <span style={META}>无需高级设置</span>
        )}
      </div>
    </Drawer>
  );
}

const identityBlockStyle: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-1)",
  paddingBottom: "var(--space-3)",
  borderBottom: "1px solid var(--border-subtle)",
};

const typeLabelStyle: React.CSSProperties = {
  color: "var(--text-primary)",
  fontSize: "var(--text-md)",
  fontWeight: 700,
};

const metaGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: "var(--space-3)",
};

const metaItemStyle: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: "var(--space-1)",
};

const metaValueStyle: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-primary)",
  fontSize: "var(--text-sm)",
  fontWeight: 650,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "var(--border-subtle)",
  margin: "var(--space-1) 0",
};
