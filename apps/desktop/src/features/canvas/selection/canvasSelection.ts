export interface CanvasSelectionState {
  nodeIds: string[];
  primaryNodeId: string | null;
  groupId: string | null;
  edgeId: string | null;
  inspectingNodeId: string | null;
}

type InspectorMode = "preserve" | "close" | "open";

export type CanvasSelectionAction =
  | { type: "reset" }
  | {
      type: "sync-flow-selection";
      nodeIds: string[];
      edgeId: string | null;
      lockedEdgeId: string | null;
      retainedGroupId: string | null;
    }
  | {
      type: "select-node";
      nodeId: string;
      mode: "replace" | "preserve";
      inspector: InspectorMode;
    }
  | { type: "prepare-node-toggle" }
  | { type: "select-group"; groupId: string; nodeIds: string[] }
  | {
      type: "select-edge";
      edgeId: string | null;
      inspector: Exclude<InspectorMode, "open">;
    }
  | { type: "clear-canvas"; closeInspector: boolean }
  | { type: "close-inspector" }
  | { type: "remove-nodes"; nodeIds: string[] }
  | { type: "remove-edge"; edgeId: string }
  | { type: "clear-group"; groupId: string }
  | {
      type: "restore-graph-selection";
      nodeIds: string[];
      primaryNodeId: string | null;
      groupId: string | null;
    };

export function createEmptyCanvasSelection(): CanvasSelectionState {
  return {
    nodeIds: [],
    primaryNodeId: null,
    groupId: null,
    edgeId: null,
    inspectingNodeId: null,
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

function inspectorTarget(
  state: CanvasSelectionState,
  mode: InspectorMode,
  nodeId: string,
): string | null {
  if (mode === "open") return nodeId;
  if (mode === "close") return null;
  return state.inspectingNodeId;
}

export function canvasSelectionReducer(
  state: CanvasSelectionState,
  action: CanvasSelectionAction,
): CanvasSelectionState {
  switch (action.type) {
    case "reset":
      return createEmptyCanvasSelection();
    case "sync-flow-selection": {
      const nodeIds = uniqueIds(action.nodeIds);
      if (action.lockedEdgeId && nodeIds.length > 0) {
        return {
          ...state,
          nodeIds: [],
          primaryNodeId: null,
          groupId: null,
          edgeId: action.lockedEdgeId,
        };
      }
      if (nodeIds.length > 0) {
        return {
          ...state,
          nodeIds,
          primaryNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
          groupId: action.retainedGroupId,
          edgeId: null,
        };
      }
      return {
        ...state,
        nodeIds: [],
        primaryNodeId: null,
        groupId: null,
        edgeId: action.edgeId ?? action.lockedEdgeId,
      };
    }
    case "select-node": {
      const nodeIds = action.mode === "preserve" ? state.nodeIds : [action.nodeId];
      return {
        ...state,
        nodeIds,
        primaryNodeId: action.nodeId,
        groupId: action.mode === "preserve" ? state.groupId : null,
        edgeId: null,
        inspectingNodeId: inspectorTarget(
          state,
          action.inspector,
          action.nodeId,
        ),
      };
    }
    case "prepare-node-toggle":
      return { ...state, edgeId: null, inspectingNodeId: null };
    case "select-group": {
      const nodeIds = uniqueIds(action.nodeIds);
      return {
        ...state,
        nodeIds,
        primaryNodeId: nodeIds.length === 1 ? nodeIds[0] : null,
        groupId: action.groupId,
        edgeId: null,
        inspectingNodeId: null,
      };
    }
    case "select-edge":
      return {
        ...state,
        nodeIds: [],
        primaryNodeId: null,
        groupId: null,
        edgeId: action.edgeId,
        inspectingNodeId:
          action.inspector === "close" ? null : state.inspectingNodeId,
      };
    case "clear-canvas":
      return {
        ...createEmptyCanvasSelection(),
        inspectingNodeId: action.closeInspector ? null : state.inspectingNodeId,
      };
    case "close-inspector":
      return { ...state, inspectingNodeId: null };
    case "remove-nodes": {
      const removed = new Set(action.nodeIds);
      const nodeIds = state.nodeIds.filter((id) => !removed.has(id));
      return {
        ...state,
        nodeIds,
        primaryNodeId:
          state.primaryNodeId && removed.has(state.primaryNodeId)
            ? nodeIds.length === 1
              ? nodeIds[0]
              : null
            : state.primaryNodeId,
        groupId: null,
        inspectingNodeId:
          state.inspectingNodeId && removed.has(state.inspectingNodeId)
            ? null
            : state.inspectingNodeId,
      };
    }
    case "remove-edge":
      return state.edgeId === action.edgeId
        ? { ...state, edgeId: null }
        : state;
    case "clear-group":
      return state.groupId === action.groupId
        ? { ...state, groupId: null }
        : state;
    case "restore-graph-selection":
      return {
        nodeIds: uniqueIds(action.nodeIds),
        primaryNodeId: action.primaryNodeId,
        groupId: action.groupId,
        edgeId: null,
        inspectingNodeId: null,
      };
  }
}
