import {
  BaseEdge,
  Position,
  getBezierPath,
  useStore,
  type EdgeProps,
} from "@xyflow/react";
import type { CanvasHandleAnchor } from "./canvasHandles.js";
import type { CanvasPoint, FluxConnectionDraft } from "./connection/domain.js";

function positionForAnchor(anchor: CanvasHandleAnchor): Position {
  return {
    top: Position.Top,
    right: Position.Right,
    bottom: Position.Bottom,
    left: Position.Left,
  }[anchor];
}

function positionFacing(fixed: CanvasPoint, moving: CanvasPoint): Position {
  const dx = fixed.x - moving.x;
  const dy = fixed.y - moving.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? Position.Right : Position.Left;
  }
  return dy >= 0 ? Position.Bottom : Position.Top;
}

function resolveFluxEdgeGeometry(input: {
  source: CanvasPoint;
  target: CanvasPoint;
  sourcePosition: Position;
  targetPosition: Position;
  draft?: FluxConnectionDraft;
}) {
  const movingSource = input.draft?.movingEndpoint === "source";
  const movingTarget = input.draft?.movingEndpoint === "target";
  const visualSource = input.draft?.source ?? input.source;
  const visualTarget = input.draft?.target ?? input.target;
  const movingAnchor = movingSource
    ? input.draft?.sourceAnchor
    : input.draft?.targetAnchor;
  const movingPosition = movingAnchor
    ? positionForAnchor(movingAnchor)
    : input.draft
      ? positionFacing(
          movingSource ? visualTarget : visualSource,
          input.draft.pointer,
        )
      : null;
  return {
    visualSource,
    visualTarget,
    visualSourcePosition: movingSource && movingPosition
      ? movingPosition
      : input.sourcePosition,
    visualTargetPosition: movingTarget && movingPosition
      ? movingPosition
      : input.targetPosition,
  };
}

const COMPACT_EDGE_DISTANCE_PX = 32;
const MIN_EDGE_LABEL_DISTANCE_PX = 72;

function compactEdgePath(input: {
  source: CanvasPoint;
  target: CanvasPoint;
}): [path: string, labelX: number, labelY: number] {
  return [
    `M${input.source.x},${input.source.y} L${input.target.x},${input.target.y}`,
    (input.source.x + input.target.x) / 2,
    (input.source.y + input.target.y) / 2,
  ];
}

function MovingEndpoint({ draft }: { draft: FluxConnectionDraft }) {
  if (draft.status !== "pending") return null;
  return (
    <circle
      className="canvas-edge-moving-endpoint"
      data-status={draft.status}
      cx={draft.pointer.x}
      cy={draft.pointer.y}
      r={5}
    />
  );
}

export function FluxEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerStart,
  markerEnd,
  interactionWidth,
  label,
  labelStyle,
  labelShowBg,
  labelBgStyle,
  labelBgPadding,
  labelBgBorderRadius,
}: EdgeProps) {
  const zoom = useStore((state) => state.transform[2]);
  const draft = data?.connectionDraft as FluxConnectionDraft | undefined;
  const {
    visualSource,
    visualTarget,
    visualSourcePosition,
    visualTargetPosition,
  } = resolveFluxEdgeGeometry({
    source: { x: sourceX, y: sourceY },
    target: { x: targetX, y: targetY },
    sourcePosition,
    targetPosition,
    draft,
  });
  const endpointDistance = Math.hypot(
    visualTarget.x - visualSource.x,
    visualTarget.y - visualSource.y,
  );
  const endpointScreenDistance = endpointDistance * zoom;
  const compact = endpointScreenDistance < COMPACT_EDGE_DISTANCE_PX && !draft;
  const [path, labelX, labelY] = compact
    ? compactEdgePath({
        source: visualSource,
        target: visualTarget,
      })
    : getBezierPath({
        sourceX: visualSource.x,
        sourceY: visualSource.y,
        sourcePosition: visualSourcePosition,
        targetX: visualTarget.x,
        targetY: visualTarget.y,
        targetPosition: visualTargetPosition,
      });
  const visibleLabel = endpointScreenDistance >= MIN_EDGE_LABEL_DISTANCE_PX ? label : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        labelX={labelX}
        labelY={labelY}
        label={visibleLabel}
        labelStyle={labelStyle}
        labelShowBg={labelShowBg}
        labelBgStyle={labelBgStyle}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
        markerStart={markerStart}
        markerEnd={markerEnd}
        interactionWidth={interactionWidth}
        style={{
          ...style,
          vectorEffect: "non-scaling-stroke",
        }}
      />
      {draft ? <MovingEndpoint draft={draft} /> : null}
    </>
  );
}

export function FluxConnectionDraftLayer({ draft }: { draft: FluxConnectionDraft }) {
  const source = draft.source ?? draft.pointer;
  const target = draft.target ?? draft.pointer;
  const sourcePosition = draft.sourceAnchor
    ? positionForAnchor(draft.sourceAnchor)
    : positionFacing(target, source);
  const targetPosition = draft.targetAnchor
    ? positionForAnchor(draft.targetAnchor)
    : positionFacing(source, target);
  const {
    visualSource,
    visualTarget,
    visualSourcePosition,
    visualTargetPosition,
  } = resolveFluxEdgeGeometry({ source, target, sourcePosition, targetPosition, draft });
  const [path] = getBezierPath({
    sourceX: visualSource.x,
    sourceY: visualSource.y,
    sourcePosition: visualSourcePosition,
    targetX: visualTarget.x,
    targetY: visualTarget.y,
    targetPosition: visualTargetPosition,
  });

  return (
    <svg className="canvas-connection-draft-layer" aria-hidden="true">
      <BaseEdge
        id="connection-draft-preview"
        path={path}
        className="canvas-edge-draft"
        interactionWidth={0}
        style={{
          stroke: draft.status === "invalid" ? "var(--danger)" : "var(--accent)",
          strokeWidth: 1.8,
          strokeDasharray: "5 5",
          strokeLinecap: "round",
        }}
      />
      <MovingEndpoint draft={draft} />
    </svg>
  );
}
