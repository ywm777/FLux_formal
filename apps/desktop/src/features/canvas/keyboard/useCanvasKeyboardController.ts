import { useEffect } from "react";
import {
  isEditableShortcutTarget,
  matchesShortcut,
} from "../../../lib/keyboardShortcuts.js";

export interface CanvasKeyboardControllerInput {
  active: boolean;
  renameOpen: boolean;
  paletteOpen: boolean;
  menuOpen: boolean;
  inspectingNodeId: string | null;
  selectedNodeId: string | null;
  selectedNodeIds: string[];
  selectedEdgeId: string | null;
  onCloseRename(): void;
  onClosePalette(): void;
  onCloseMenu(): void;
  onCloseInspector(): void;
  onClearSelection(): void;
  onAddNode(): void;
  onSave(): unknown;
  onRunPreview(): unknown;
  onFitView(): unknown;
  onUndo(): void;
  onRedo(): void;
  onDeleteEdge(id: string): void;
  onDeleteSelectedNodes(): void;
  onDuplicateSelectedNodes(): void;
  onNudgeSelectedNodes(key: string, distance: number): void;
  onInspectNode(id: string): void;
  onDeleteNode(id: string): void;
  onDuplicateNode(id: string): void;
  onNudgeNode(id: string, key: string, distance: number): void;
}

export function useCanvasKeyboardController({
  active,
  renameOpen,
  paletteOpen,
  menuOpen,
  inspectingNodeId,
  selectedNodeId,
  selectedNodeIds,
  selectedEdgeId,
  onCloseRename,
  onClosePalette,
  onCloseMenu,
  onCloseInspector,
  onClearSelection,
  onAddNode,
  onSave,
  onRunPreview,
  onFitView,
  onUndo,
  onRedo,
  onDeleteEdge,
  onDeleteSelectedNodes,
  onDuplicateSelectedNodes,
  onNudgeSelectedNodes,
  onInspectNode,
  onDeleteNode,
  onDuplicateNode,
  onNudgeNode,
}: CanvasKeyboardControllerInput) {
  useEffect(() => {
    if (!active) return;

    function onCanvasKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      if (matchesShortcut(event, "close-layer")) {
        event.preventDefault();
        if (renameOpen) {
          onCloseRename();
          return;
        }
        if (paletteOpen) {
          onClosePalette();
          return;
        }
        if (menuOpen) {
          onCloseMenu();
          return;
        }
        if (inspectingNodeId) {
          onCloseInspector();
          return;
        }
        onClearSelection();
        return;
      }

      if (
        isEditableShortcutTarget(event.target) ||
        isEditableShortcutTarget(document.activeElement)
      ) return;

      if (matchesShortcut(event, "add-node")) {
        event.preventDefault();
        onAddNode();
        return;
      }

      if (matchesShortcut(event, "save-workflow")) {
        event.preventDefault();
        void onSave();
        return;
      }

      if (matchesShortcut(event, "run-preview")) {
        event.preventDefault();
        void onRunPreview();
        return;
      }

      if (matchesShortcut(event, "fit-view")) {
        event.preventDefault();
        void onFitView();
        return;
      }

      if (matchesShortcut(event, "redo")) {
        event.preventDefault();
        onRedo();
        return;
      }

      if (matchesShortcut(event, "undo")) {
        event.preventDefault();
        onUndo();
        return;
      }

      if (selectedEdgeId && matchesShortcut(event, "delete-node")) {
        event.preventDefault();
        onDeleteEdge(selectedEdgeId);
        return;
      }

      if (selectedNodeIds.length > 0 && matchesShortcut(event, "delete-node")) {
        event.preventDefault();
        onDeleteSelectedNodes();
        return;
      }

      if (selectedNodeIds.length > 1 && matchesShortcut(event, "duplicate-node")) {
        event.preventDefault();
        onDuplicateSelectedNodes();
        return;
      }

      if (selectedNodeIds.length > 1 && matchesShortcut(event, "nudge-node-fast")) {
        event.preventDefault();
        onNudgeSelectedNodes(event.key, 24);
        return;
      }

      if (selectedNodeIds.length > 1 && matchesShortcut(event, "nudge-node")) {
        event.preventDefault();
        onNudgeSelectedNodes(event.key, 8);
        return;
      }

      if (!selectedNodeId) return;

      if (matchesShortcut(event, "inspect-node")) {
        event.preventDefault();
        onInspectNode(selectedNodeId);
        return;
      }

      if (matchesShortcut(event, "delete-node")) {
        event.preventDefault();
        onDeleteNode(selectedNodeId);
        return;
      }

      if (matchesShortcut(event, "duplicate-node")) {
        event.preventDefault();
        onDuplicateNode(selectedNodeId);
        return;
      }

      if (matchesShortcut(event, "nudge-node-fast")) {
        event.preventDefault();
        onNudgeNode(selectedNodeId, event.key, 24);
        return;
      }

      if (matchesShortcut(event, "nudge-node")) {
        event.preventDefault();
        onNudgeNode(selectedNodeId, event.key, 8);
      }
    }

    window.addEventListener("keydown", onCanvasKeyDown);
    return () => window.removeEventListener("keydown", onCanvasKeyDown);
  }, [
    active,
    renameOpen,
    paletteOpen,
    menuOpen,
    inspectingNodeId,
    selectedNodeId,
    selectedNodeIds,
    selectedEdgeId,
    onCloseRename,
    onClosePalette,
    onCloseMenu,
    onCloseInspector,
    onClearSelection,
    onAddNode,
    onSave,
    onRunPreview,
    onFitView,
    onUndo,
    onRedo,
    onDeleteEdge,
    onDeleteSelectedNodes,
    onDuplicateSelectedNodes,
    onNudgeSelectedNodes,
    onInspectNode,
    onDeleteNode,
    onDuplicateNode,
    onNudgeNode,
  ]);
}
