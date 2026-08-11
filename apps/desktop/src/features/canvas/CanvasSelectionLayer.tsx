import {
  ViewportPortal,
  type Node,
} from "@xyflow/react";
import type { CanvasGroup } from "@flux/workflow-schema";
import type { FluxNodeData } from "./FluxNode.js";

export interface CanvasBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasGroupLayout {
  group: CanvasGroup;
  bounds: CanvasBounds;
}

interface CanvasSelectionLayerProps {
  selectedNodes: Node<FluxNodeData>[];
  selectionBounds: CanvasBounds | null;
  groupLayouts: CanvasGroupLayout[];
  selectedGroupId: string | null;
  onMergeSelection: () => void;
  onDuplicateSelection: () => void;
  onDeleteSelection: () => void;
  onSelectGroup: (group: CanvasGroup) => void;
  onUngroup: (groupId: string) => void;
  onGroupPointerDown: (
    event: React.PointerEvent<HTMLButtonElement>,
    group: CanvasGroup,
  ) => void;
  onGroupPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onGroupPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
}

export function CanvasSelectionLayer({
  selectedNodes,
  selectionBounds,
  groupLayouts,
  selectedGroupId,
  onMergeSelection,
  onDuplicateSelection,
  onDeleteSelection,
  onSelectGroup,
  onUngroup,
  onGroupPointerDown,
  onGroupPointerMove,
  onGroupPointerUp,
}: CanvasSelectionLayerProps) {
  return (
    <ViewportPortal>
      {groupLayouts.map(({ group, bounds }) => {
        const selected = selectedGroupId === group.id;
        return (
          <div
            key={group.id}
            className="canvas-node-group"
            data-selected={selected ? "true" : "false"}
            style={{
              left: bounds.x - 24,
              top: bounds.y - 48,
              width: bounds.width + 48,
              height: bounds.height + 72,
            }}
          >
            <div className="canvas-node-group-header nodrag nopan">
              <button
                type="button"
                className="canvas-node-group-title"
                aria-label={`移动${group.label}，包含 ${group.nodeIds.length} 个节点`}
                title="拖动整组"
                onClick={() => onSelectGroup(group)}
                onPointerDown={(event) => onGroupPointerDown(event, group)}
                onPointerMove={onGroupPointerMove}
                onPointerUp={onGroupPointerUp}
                onPointerCancel={onGroupPointerUp}
              >
                <GroupIcon />
                <span>{group.label}</span>
                <small>{group.nodeIds.length}</small>
              </button>
              {selected ? (
                <button
                  type="button"
                  className="canvas-selection-icon-button"
                  aria-label="解除组合"
                  title="解除组合"
                  onClick={(event) => {
                    event.stopPropagation();
                    onUngroup(group.id);
                  }}
                >
                  <UngroupIcon />
                </button>
              ) : null}
            </div>
          </div>
        );
      })}

      {selectedNodes.length > 1 && selectionBounds && !selectedGroupId ? (
        <div
          className="canvas-selection-toolbar nodrag nopan"
          role="toolbar"
          aria-label="批量节点操作"
          style={{
            left: selectionBounds.x + selectionBounds.width / 2,
            top: selectionBounds.y - 12,
          }}
        >
          <span className="canvas-selection-count">
            已选 {selectedNodes.length} 个节点
          </span>
          <span className="canvas-selection-divider" aria-hidden />
          <button
            type="button"
            className="canvas-selection-action"
            onClick={onMergeSelection}
            title="合并为可整体移动的节点组"
          >
            <GroupIcon />
            组合
          </button>
          <button
            type="button"
            className="canvas-selection-icon-button"
            onClick={onDuplicateSelection}
            aria-label="复制所选节点"
            title="复制所选节点"
          >
            <DuplicateIcon />
          </button>
          <button
            type="button"
            className="canvas-selection-icon-button"
            data-tone="danger"
            onClick={onDeleteSelection}
            aria-label="删除所选节点"
            title="删除所选节点"
          >
            <TrashIcon />
          </button>
        </div>
      ) : null}
    </ViewportPortal>
  );
}

function GroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 5h2.2c1.1 0 2 .9 2 2v2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function UngroupIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="2" y="3" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="9" y="9" width="5" height="4" rx="1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="m7.2 10.8 1.6-1.6M9 7 7.4 8.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function DuplicateIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <rect x="5.2" y="5.2" width="7.3" height="7.3" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.5 10.8H3.1c-.9 0-1.6-.7-1.6-1.6V3.1c0-.9.7-1.6 1.6-1.6h6.1c.9 0 1.6.7 1.6 1.6v.4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path d="M3.2 4.5h9.6M6.2 4.5V3.2c0-.5.4-.9.9-.9h1.8c.5 0 .9.4.9.9v1.3M4.5 6.2 5 12.4c.1.7.6 1.1 1.3 1.1h3.4c.7 0 1.2-.4 1.3-1.1l.5-6.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
    </svg>
  );
}
