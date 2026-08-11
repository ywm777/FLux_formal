import type { Connection, Edge } from "@xyflow/react";
import { parseCanvasHandleId } from "../canvasHandles.js";

export interface EdgeCommandResult {
  edges: Edge[];
  changed: boolean;
}

function sameLogicalConnection(left: Edge, right: Connection): boolean {
  return (
    left.source === right.source &&
    left.target === right.target &&
    parseCanvasHandleId(left.sourceHandle)?.portId ===
      parseCanvasHandleId(right.sourceHandle)?.portId &&
    parseCanvasHandleId(left.targetHandle)?.portId ===
      parseCanvasHandleId(right.targetHandle)?.portId
  );
}

export function createEdgeAtomically(input: {
  edges: Edge[];
  edgeId: string;
  connection: Connection;
  data?: Record<string, unknown>;
}): EdgeCommandResult {
  if (input.edges.some((edge) => sameLogicalConnection(edge, input.connection))) {
    return { edges: input.edges, changed: false };
  }
  return {
    changed: true,
    edges: [
      ...input.edges,
      {
        id: input.edgeId,
        ...input.connection,
        data: input.data,
      },
    ],
  };
}

export function reconnectEdgeAtomically(input: {
  edges: Edge[];
  edgeId: string;
  connection: Connection;
  data?: Record<string, unknown>;
}): EdgeCommandResult {
  const existing = input.edges.find((edge) => edge.id === input.edgeId);
  if (!existing) return { edges: input.edges, changed: false };
  const unchanged =
    existing.source === input.connection.source &&
    existing.target === input.connection.target &&
    existing.sourceHandle === input.connection.sourceHandle &&
    existing.targetHandle === input.connection.targetHandle;
  if (unchanged) return { edges: input.edges, changed: false };

  const nextEdges = input.edges.map((edge) => edge.id === input.edgeId
    ? {
        ...edge,
        ...input.connection,
        selected: true,
        data: input.data ?? edge.data,
      }
    : edge);
  if (nextEdges.length !== input.edges.length) {
    throw new Error("Reconnecting an edge must preserve the edge count.");
  }
  return { edges: nextEdges, changed: true };
}
