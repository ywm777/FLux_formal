import type { Connection, Edge, Node } from "@xyflow/react";
import { resolvePortCapacity } from "@flux/node-sdk";
import { registry } from "../../../lib/registry.js";
import {
  createCanvasHandleId,
  parseCanvasHandleId,
} from "../canvasHandles.js";
import type { FluxNodeData } from "../FluxNode.js";
import type {
  CanvasPortCapacity,
  CanvasPortRef,
  ConnectionValidationReason,
} from "./domain.js";
import {
  allowsAdditionalConnection,
  resolveConnectionStartIntent,
  type ConnectionStartDecision,
} from "./cardinality.js";

interface PolicyPort {
  id: string;
  name: string;
  dataType?: string;
  capacity?: CanvasPortCapacity;
}

export interface ConnectionValidation {
  connection: Connection | null;
  reason: ConnectionValidationReason | null;
}

export type CanvasConnectionStartDecision =
  | ConnectionStartDecision
  | { mode: "blocked"; reason: "missing-port" };

function nodePorts(
  node: Node<FluxNodeData>,
  kind: "source" | "target",
): PolicyPort[] {
  return (kind === "source" ? node.data.outputs : node.data.inputs) as PolicyPort[];
}

function edgePortId(edge: Edge, kind: "source" | "target"): string | null {
  return parseCanvasHandleId(
    kind === "source" ? edge.sourceHandle : edge.targetHandle,
  )?.portId ?? null;
}

function connectionPortId(
  connection: Connection,
  kind: "source" | "target",
): string | null {
  return parseCanvasHandleId(
    kind === "source" ? connection.sourceHandle : connection.targetHandle,
  )?.portId ?? null;
}

export function normalizeCanvasConnection(
  connection: Connection | Edge,
  nodes: Node<FluxNodeData>[],
): Connection | null {
  if (connection.source === connection.target) return null;
  const sourceNode = nodes.find((node) => node.id === connection.source);
  const targetNode = nodes.find((node) => node.id === connection.target);
  if (!sourceNode || !targetNode) return null;

  const sourceVisualHandle = parseCanvasHandleId(connection.sourceHandle);
  const targetVisualHandle = parseCanvasHandleId(connection.targetHandle);
  const sourcePort = nodePorts(sourceNode, "source").some(
    (port) => port.id === sourceVisualHandle?.portId,
  )
    ? sourceVisualHandle!.portId
    : nodePorts(sourceNode, "source")[0]?.id;
  const targetPort = nodePorts(targetNode, "target").some(
    (port) => port.id === targetVisualHandle?.portId,
  )
    ? targetVisualHandle!.portId
    : nodePorts(targetNode, "target")[0]?.id;
  if (!sourcePort || !targetPort) return null;

  return {
    source: sourceNode.id,
    target: targetNode.id,
    sourceHandle: createCanvasHandleId(
      "source",
      sourcePort,
      sourceVisualHandle?.anchor ?? "right",
    ),
    targetHandle: createCanvasHandleId(
      "target",
      targetPort,
      targetVisualHandle?.anchor ?? "left",
    ),
  };
}

export function edgeEndpointForPort(
  edge: Edge,
  port: Pick<CanvasPortRef, "nodeId" | "portId" | "kind">,
): "source" | "target" | null {
  if (
    port.kind === "source" &&
    edge.source === port.nodeId &&
    edgePortId(edge, "source") === port.portId
  ) return "source";
  if (
    port.kind === "target" &&
    edge.target === port.nodeId &&
    edgePortId(edge, "target") === port.portId
  ) return "target";
  return null;
}

export function findIncidentEdges(
  edges: Edge[],
  port: Pick<CanvasPortRef, "nodeId" | "portId" | "kind">,
): Edge[] {
  return edges.filter((edge) => edgeEndpointForPort(edge, port) !== null);
}

/**
 * 决定一次端口拖动是新建分支还是调整既有连线。
 * 重连必须由用户先显式选中边；端口是否还可新建由统一 capacity 契约决定。
 */
export function resolveCanvasConnectionStart(input: {
  port: Pick<CanvasPortRef, "nodeId" | "portId" | "kind">;
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  selectedEdgeId: string | null;
}): CanvasConnectionStartDecision {
  const selectedEdge = input.selectedEdgeId
    ? input.edges.find((edge) => edge.id === input.selectedEdgeId)
    : undefined;
  const selectedEndpoint = selectedEdge
    ? edgeEndpointForPort(selectedEdge, input.port)
    : null;
  const node = input.nodes.find((candidate) => candidate.id === input.port.nodeId);
  const port = node
    ? nodePorts(node, input.port.kind).find((candidate) => candidate.id === input.port.portId)
    : undefined;
  if (!port) return { mode: "blocked", reason: "missing-port" };

  const direction = input.port.kind === "source" ? "output" : "input";
  const incidentEdges = findIncidentEdges(input.edges, input.port);
  return resolveConnectionStartIntent({
    kind: input.port.kind,
    capacity: resolvePortCapacity(port, direction),
    incidentEdgeCount: incidentEdges.length,
    selectedIncidentEdge: selectedEdge && selectedEndpoint
      ? { edgeId: selectedEdge.id, endpoint: selectedEndpoint }
      : null,
  });
}

function sameLogicalConnection(edge: Edge, connection: Connection): boolean {
  return (
    edge.source === connection.source &&
    edge.target === connection.target &&
    edgePortId(edge, "source") === connectionPortId(connection, "source") &&
    edgePortId(edge, "target") === connectionPortId(connection, "target")
  );
}

function typesCompatible(sourceType: string, targetType: string): boolean {
  return sourceType === "any" || targetType === "any" || sourceType === targetType;
}

function isErrorHandlerNode(node: Node<FluxNodeData>): boolean {
  return registry.resolve(node.data.fluxType)?.executionRole === "error-handler";
}

function createsCycle(
  connection: Connection,
  edges: Edge[],
  ignoredEdgeId: string | null,
): boolean {
  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    if (edge.id === ignoredEdgeId) continue;
    const targets = adjacency.get(edge.source) ?? new Set<string>();
    targets.add(edge.target);
    adjacency.set(edge.source, targets);
  }
  const proposedTargets = adjacency.get(connection.source) ?? new Set<string>();
  proposedTargets.add(connection.target);
  adjacency.set(connection.source, proposedTargets);

  const pending = [connection.target];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const nodeId = pending.pop()!;
    if (nodeId === connection.source) return true;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);
    pending.push(...(adjacency.get(nodeId) ?? []));
  }
  return false;
}

export function validateCanvasConnection(input: {
  connection: Connection | Edge;
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  ignoredEdgeId?: string | null;
}): ConnectionValidation {
  const normalized = normalizeCanvasConnection(input.connection, input.nodes);
  if (!normalized) {
    const reason = input.connection.source === input.connection.target
      ? "same-node"
      : "missing-node";
    return { connection: null, reason };
  }

  const sourceNode = input.nodes.find((node) => node.id === normalized.source);
  const targetNode = input.nodes.find((node) => node.id === normalized.target);
  const sourcePortId = connectionPortId(normalized, "source");
  const targetPortId = connectionPortId(normalized, "target");
  const sourcePort = sourceNode
    ? nodePorts(sourceNode, "source").find((port) => port.id === sourcePortId)
    : null;
  const targetPort = targetNode
    ? nodePorts(targetNode, "target").find((port) => port.id === targetPortId)
    : null;
  if (!sourceNode || !targetNode) return { connection: null, reason: "missing-node" };
  if (!sourcePort || !targetPort) return { connection: null, reason: "missing-port" };
  if (
    !isErrorHandlerNode(targetNode) &&
    !typesCompatible(sourcePort.dataType ?? "any", targetPort.dataType ?? "any")
  ) {
    return { connection: null, reason: "incompatible-type" };
  }

  const ignoredEdgeId = input.ignoredEdgeId ?? null;
  const otherEdges = input.edges.filter((edge) => edge.id !== ignoredEdgeId);
  if (otherEdges.some((edge) => sameLogicalConnection(edge, normalized))) {
    return { connection: null, reason: "duplicate" };
  }
  if (
    !allowsAdditionalConnection(
      resolvePortCapacity(sourcePort, "output"),
      otherEdges.filter(
        (edge) => edge.source === normalized.source && edgePortId(edge, "source") === sourcePortId,
      ).length,
    )
  ) {
    return { connection: null, reason: "source-occupied" };
  }
  if (
    !allowsAdditionalConnection(
      resolvePortCapacity(targetPort, "input"),
      otherEdges.filter(
        (edge) => edge.target === normalized.target && edgePortId(edge, "target") === targetPortId,
      ).length,
    )
  ) {
    return { connection: null, reason: "target-occupied" };
  }
  if (createsCycle(normalized, input.edges, ignoredEdgeId)) {
    return { connection: null, reason: "cycle" };
  }
  return { connection: normalized, reason: null };
}

export function connectionValidationMessage(reason: ConnectionValidationReason): string {
  return {
    "missing-node": "连接目标不存在",
    "missing-port": "节点没有可用的业务端口",
    "same-node": "节点不能连接到自身",
    "incompatible-type": "两个端口的数据类型不兼容",
    duplicate: "这两个端口已经连接，已选中原连线",
    "source-occupied": "该输出端口已有连线，请先调整现有连线",
    "target-occupied": "该输入端口已有连线",
    cycle: "该连接会形成循环工作流",
  }[reason];
}
