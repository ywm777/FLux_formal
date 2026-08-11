import type { Node, Edge } from "@xyflow/react";
import {
  resolvePortCapacity,
  type NodeDefinition,
} from "@flux/node-sdk";
import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  type CanvasGroup,
  type WorkflowGraph,
} from "@flux/workflow-schema";
import type { CarrierColorKey } from "@flux/ui";
import { registry } from "../../lib/registry.js";
import type { FluxNodeData } from "./FluxNode.js";
import {
  createCanvasHandleId,
  normalizeCanvasHandleAnchor,
  parseCanvasHandleId,
} from "./canvasHandles.js";
import { ERROR_OUTPUT_PORT_ID } from "@flux/node-sdk";

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
      inputs: def.ports.inputs.map((p) => ({
        id: p.id,
        name: p.name,
        dataType: p.dataType ?? "any",
        capacity: resolvePortCapacity(p, "input"),
      })),
      outputs: def.ports.outputs.map((p) => ({
        id: p.id,
        name: p.name,
        dataType: p.dataType ?? "any",
        capacity: resolvePortCapacity(p, "output"),
      })),
      config: {},
    },
  };
}

/** 节点自定义标题在序列化 data 中的保留键 */
const LABEL_KEY = "_label";
const LEGACY_NODE_LABELS: Record<string, Record<string, string>> = {
  "flux.input.text": {
    "文本输入": "文本",
  },
  "flux.action.log": {
    "日志输出": "记录结果",
  },
};

function resolveNodeLabel(
  type: string,
  storedLabel: unknown,
  def: NodeDefinition | undefined,
): string {
  if (typeof storedLabel === "string" && storedLabel.trim()) {
    return LEGACY_NODE_LABELS[type]?.[storedLabel] ?? storedLabel;
  }
  return def?.name ?? type;
}

/** ReactFlow 图 → 持久化 WorkflowGraph */
export function toWorkflowGraph(
  id: string,
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
  viewport: { x: number; y: number; zoom: number },
  title = "未命名工作流",
  groups: CanvasGroup[] = [],
): WorkflowGraph {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
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
      size: typeof n.width === "number" && typeof n.height === "number"
        ? { width: n.width, height: n.height }
        : undefined,
      data: { ...n.data.config, [LABEL_KEY]: n.data.label },
      ports: {
        inputs: n.data.inputs.map((p) => ({
          ...p,
          dataType: p.dataType ?? "any",
          capacity: resolvePortCapacity(p, "input"),
        })),
        outputs: n.data.outputs.map((p) => ({
          ...p,
          dataType: p.dataType ?? "any",
          capacity: resolvePortCapacity(p, "output"),
        })),
      },
    })),
    groups: groups.map((group) => ({
      ...group,
      nodeIds: [...group.nodeIds],
    })),
    edges: edges.flatMap((e) => {
      const sourceNode = nodeById.get(e.source);
      const targetNode = nodeById.get(e.target);
      if (!sourceNode || !targetNode) return [];
      const sourceHandle = parseCanvasHandleId(e.sourceHandle);
      const targetHandle = parseCanvasHandleId(e.targetHandle);
      const sourcePort = sourceNode.data.outputs.find((port) => port.id === sourceHandle?.portId)?.id
        ?? sourceNode.data.outputs[0]?.id;
      const targetPort = targetNode.data.inputs.find((port) => port.id === targetHandle?.portId)?.id
        ?? targetNode.data.inputs[0]?.id;
      if (!sourcePort || !targetPort) return [];
      const route = e.data?.route === "error" ? "error" : "normal";
      return [{
        id: e.id,
        source: e.source,
        target: e.target,
        sourcePort,
        targetPort,
        sourceAnchor: sourceHandle?.anchor ?? "right",
        targetAnchor: targetHandle?.anchor ?? "left",
        route,
      }];
    }),
  };
}

/** 持久化 WorkflowGraph → ReactFlow 图（用于加载已保存工作流） */
export function fromWorkflowGraph(graph: WorkflowGraph): {
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  groups: CanvasGroup[];
} {
  const nodes: Node<FluxNodeData>[] = graph.nodes.map((n) => {
    const def = registry.resolve(n.type);
    const { [LABEL_KEY]: storedLabel, ...config } = n.data as Record<
      string,
      unknown
    >;
    const inputs =
      n.ports.inputs.length > 0
        ? n.ports.inputs.map((p) => {
            const currentPort = def?.ports.inputs.find((candidate) => candidate.id === p.id);
            return {
              id: p.id,
              name: currentPort?.name ?? p.name,
              dataType: currentPort?.dataType ?? p.dataType,
              capacity: resolvePortCapacity(currentPort ?? p, "input"),
            };
          })
        : (def?.ports.inputs ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            dataType: p.dataType ?? "any",
            capacity: resolvePortCapacity(p, "input"),
          }));
    const outputs =
      n.ports.outputs.length > 0
        ? n.ports.outputs.map((p) => {
            const currentPort = def?.ports.outputs.find((candidate) => candidate.id === p.id);
            return {
              id: p.id,
              name: currentPort?.name ?? p.name,
              dataType: currentPort?.dataType ?? p.dataType,
              capacity: resolvePortCapacity(currentPort ?? p, "output"),
            };
          })
        : (def?.ports.outputs ?? []).map((p) => ({
            id: p.id,
            name: p.name,
            dataType: p.dataType ?? "any",
            capacity: resolvePortCapacity(p, "output"),
          }));
    return {
      id: n.id,
      type: "flux",
      position: n.position,
      width: n.size?.width,
      height: n.size?.height,
      data: {
        label: resolveNodeLabel(n.type, storedLabel, def),
        fluxType: n.type,
        carrier: toCarrierKey(def?.carrier ?? "basic"),
        inputs,
        outputs,
        config,
      },
    };
  });

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges: Edge[] = graph.edges.flatMap((e) => {
    const sourceNode = nodeById.get(e.source);
    const targetNode = nodeById.get(e.target);
    if (!sourceNode || !targetNode) return [];
    const targetIsErrorHandler = registry.resolve(targetNode?.data.fluxType ?? "")?.executionRole === "error-handler";
    const route = e.route === "error" || e.sourcePort === ERROR_OUTPUT_PORT_ID || targetIsErrorHandler
      ? "error"
      : "normal";
    const requestedSourcePort = e.sourcePort === ERROR_OUTPUT_PORT_ID ? null : e.sourcePort;
    const sourcePort = sourceNode.data.outputs.find((port) => port.id === requestedSourcePort)?.id
      ?? sourceNode.data.outputs[0]?.id;
    const targetPort = targetNode.data.inputs.find((port) => port.id === e.targetPort)?.id
      ?? targetNode.data.inputs[0]?.id;
    if (!sourcePort || !targetPort) return [];
    const sourceAnchor = normalizeCanvasHandleAnchor(e.sourceAnchor, "right");
    const targetAnchor = normalizeCanvasHandleAnchor(e.targetAnchor, "left");
    return [{
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: createCanvasHandleId("source", sourcePort, sourceAnchor),
      targetHandle: createCanvasHandleId("target", targetPort, targetAnchor),
      data: { route },
    }];
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  const groups = (graph.groups ?? [])
    .map((group) => ({
      ...group,
      nodeIds: group.nodeIds.filter((nodeId) => nodeIds.has(nodeId)),
    }))
    .filter((group) => group.nodeIds.length >= 2);

  return { nodes, edges, groups };
}

/** 计算图内容签名（忽略视口/选中态），用于判断是否需要自动保存 */
export function graphSignature(
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
  title = "未命名工作流",
  groups: CanvasGroup[] = [],
): string {
  const compact = {
    meta: { title },
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.fluxType,
      position: n.position,
      size: typeof n.width === "number" && typeof n.height === "number"
        ? { width: n.width, height: n.height }
        : null,
      label: n.data.label,
      config: n.data.config,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      targetHandle: e.targetHandle ?? null,
      route: e.data?.route ?? "normal",
    })),
    groups: groups.map((group) => ({
      id: group.id,
      label: group.label,
      nodeIds: [...group.nodeIds],
    })),
  };
  return JSON.stringify(compact);
}
