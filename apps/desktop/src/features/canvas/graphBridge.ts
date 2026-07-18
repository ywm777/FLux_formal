import type { Node, Edge } from "@xyflow/react";
import type { NodeDefinition } from "@flux/node-sdk";
import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type WorkflowGraph,
} from "@flux/workflow-schema";
import type { CarrierColorKey } from "@flux/ui";
import type { FluxNodeData } from "./FluxNode.js";

const CARRIER_KEYS: CarrierColorKey[] = [
  "app",
  "code",
  "ai",
  "data",
  "subflow",
  "trigger",
  "basic",
];

function toCarrierKey(carrier: string): CarrierColorKey {
  return (CARRIER_KEYS as string[]).includes(carrier)
    ? (carrier as CarrierColorKey)
    : "basic";
}

/** 由节点定义创建一个画布节点 */
export function createFluxNode(
  def: NodeDefinition,
  position: { x: number; y: number },
  id: string,
): Node<FluxNodeData> {
  return {
    id,
    type: "flux",
    position,
    data: {
      label: def.name,
      fluxType: def.id,
      carrier: toCarrierKey(def.carrier),
      inputs: def.ports.inputs.map((p) => ({ id: p.id, name: p.name })),
      outputs: def.ports.outputs.map((p) => ({ id: p.id, name: p.name })),
      config: {},
    },
  };
}

/** ReactFlow 图 → 持久化 WorkflowGraph */
export function toWorkflowGraph(
  id: string,
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
  viewport: { x: number; y: number; zoom: number },
  title = "未命名工作流",
): WorkflowGraph {
  return {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    id,
    version: 1,
    viewport,
    meta: { title, tags: [] },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.fluxType,
      position: n.position,
      data: n.data.config,
      ports: {
        inputs: n.data.inputs.map((p) => ({ ...p, dataType: "any" })),
        outputs: n.data.outputs.map((p) => ({ ...p, dataType: "any" })),
      },
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourcePort: e.sourceHandle ?? undefined,
      targetPort: e.targetHandle ?? undefined,
    })),
  };
}
