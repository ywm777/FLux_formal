export type ConnectionEndpoint = "source" | "target";
export type PortCapacity = "one" | "many";

export type ConnectionStartDecision =
  | { mode: "create" }
  | { mode: "reconnect"; edgeId: string; endpoint: ConnectionEndpoint }
  | { mode: "blocked"; reason: "source-occupied" | "target-occupied" };

export function allowsAdditionalConnection(
  capacity: PortCapacity,
  incidentEdgeCount: number,
): boolean {
  return incidentEdgeCount === 0 || capacity === "many";
}

/**
 * Pure cardinality rule for starting a connection gesture.
 * Reconnection is explicit: an existing edge must be selected first.
 */
export function resolveConnectionStartIntent(input: {
  kind: ConnectionEndpoint;
  capacity: PortCapacity;
  incidentEdgeCount: number;
  selectedIncidentEdge?: {
    edgeId: string;
    endpoint: ConnectionEndpoint;
  } | null;
}): ConnectionStartDecision {
  if (input.selectedIncidentEdge) {
    return {
      mode: "reconnect",
      edgeId: input.selectedIncidentEdge.edgeId,
      endpoint: input.selectedIncidentEdge.endpoint,
    };
  }

  if (allowsAdditionalConnection(input.capacity, input.incidentEdgeCount)) {
    return { mode: "create" };
  }

  return {
    mode: "blocked",
    reason: input.kind === "source" ? "source-occupied" : "target-occupied",
  };
}
