import { useCallback, useReducer } from "react";
import type { CanvasGroup } from "@flux/workflow-schema";
import {
  canvasSelectionReducer,
  createEmptyCanvasSelection,
} from "./canvasSelection.js";

interface CanvasSelectionControllerInput {
  groups: CanvasGroup[];
}

interface FlowSelectionInput {
  nodeIds: string[];
  edgeId: string | null;
  lockedEdgeId: string | null;
}

export function useCanvasSelectionController({
  groups,
}: CanvasSelectionControllerInput) {
  const [state, dispatch] = useReducer(
    canvasSelectionReducer,
    undefined,
    createEmptyCanvasSelection,
  );

  const syncFlowSelection = useCallback(
    (input: FlowSelectionInput) => {
      const retainedGroupId =
        state.groupId &&
        groups.some(
          (group) =>
            group.id === state.groupId &&
            group.nodeIds.every((nodeId) => input.nodeIds.includes(nodeId)),
        )
          ? state.groupId
          : null;
      dispatch({
        type: "sync-flow-selection",
        ...input,
        retainedGroupId,
      });
    },
    [groups, state.groupId],
  );

  const selectNode = useCallback(
    (
      nodeId: string,
      options: {
        mode?: "replace" | "preserve";
        inspector?: "preserve" | "close" | "open";
      } = {},
    ) =>
      dispatch({
        type: "select-node",
        nodeId,
        mode: options.mode ?? "replace",
        inspector: options.inspector ?? "close",
      }),
    [],
  );

  const selectGroup = useCallback((groupId: string, nodeIds: string[]) => {
    dispatch({ type: "select-group", groupId, nodeIds });
  }, []);
  const replaceNodes = useCallback((nodeIds: string[]) => {
    dispatch({ type: "replace-nodes", nodeIds });
  }, []);
  const selectEdge = useCallback(
    (
      edgeId: string | null,
      inspector: "preserve" | "close" = "close",
    ) => dispatch({ type: "select-edge", edgeId, inspector }),
    [],
  );
  const clearCanvas = useCallback((closeInspector = true) => {
    dispatch({ type: "clear-canvas", closeInspector });
  }, []);
  const reset = useCallback(() => dispatch({ type: "reset" }), []);
  const prepareNodeToggle = useCallback(
    () => dispatch({ type: "prepare-node-toggle" }),
    [],
  );
  const closeInspector = useCallback(
    () => dispatch({ type: "close-inspector" }),
    [],
  );
  const removeNodes = useCallback((nodeIds: string[]) => {
    dispatch({ type: "remove-nodes", nodeIds });
  }, []);
  const removeEdge = useCallback((edgeId: string) => {
    dispatch({ type: "remove-edge", edgeId });
  }, []);
  const clearGroup = useCallback((groupId: string) => {
    dispatch({ type: "clear-group", groupId });
  }, []);
  const restoreGraphSelection = useCallback(
    (input: {
      nodeIds: string[];
      primaryNodeId: string | null;
      groupId: string | null;
    }) => dispatch({ type: "restore-graph-selection", ...input }),
    [],
  );

  return {
    state,
    syncFlowSelection,
    selectNode,
    replaceNodes,
    selectGroup,
    selectEdge,
    clearCanvas,
    reset,
    prepareNodeToggle,
    closeInspector,
    removeNodes,
    removeEdge,
    clearGroup,
    restoreGraphSelection,
  };
}
