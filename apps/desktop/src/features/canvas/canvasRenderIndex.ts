export interface CanvasConnectionIndexEdge {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface CanvasConnectionIndex {
  connectedHandlesByNode: Map<string, string[]>;
  nodesWithIncomingEdges: Set<string>;
}

/** 单次 O(E) 建立渲染索引，避免每个节点重复扫描全部连线。 */
export function buildCanvasConnectionIndex(
  edges: readonly CanvasConnectionIndexEdge[],
): CanvasConnectionIndex {
  const connectedHandlesByNode = new Map<string, string[]>();
  const nodesWithIncomingEdges = new Set<string>();
  const append = (nodeId: string, handleId: string | null | undefined) => {
    if (typeof handleId !== "string") return;
    const handles = connectedHandlesByNode.get(nodeId);
    if (handles) handles.push(handleId);
    else connectedHandlesByNode.set(nodeId, [handleId]);
  };
  for (const edge of edges) {
    append(edge.source, edge.sourceHandle);
    append(edge.target, edge.targetHandle);
    nodesWithIncomingEdges.add(edge.target);
  }
  return { connectedHandlesByNode, nodesWithIncomingEdges };
}
