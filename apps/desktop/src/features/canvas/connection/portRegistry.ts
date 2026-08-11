import { parseCanvasHandleId } from "../canvasHandles.js";
import type { CanvasHandleKind } from "../canvasHandles.js";
import type { CanvasPoint, CanvasPortRef } from "./domain.js";

const ENTER_RADIUS = 11;
const EXIT_RADIUS = 18;
const AMBIGUITY_DISTANCE = 3;

function distance(left: CanvasPoint, right: CanvasPoint): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function readPort(element: HTMLElement): CanvasPortRef | null {
  const nodeId = element.getAttribute("data-nodeid");
  const handleId = element.getAttribute("data-handleid");
  const parsed = parseCanvasHandleId(handleId);
  const rect = element.getBoundingClientRect();
  if (!nodeId || !handleId || !parsed || rect.width === 0 || rect.height === 0) {
    return null;
  }
  return {
    nodeId,
    handleId,
    portId: parsed.portId,
    kind: parsed.kind,
    anchor: parsed.anchor,
    screenPoint: {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    },
  };
}

export function getCanvasPort(
  nodeId: string,
  handleId: string,
): CanvasPortRef | null {
  for (const element of document.querySelectorAll<HTMLElement>(".canvas-port-handle")) {
    if (
      element.getAttribute("data-nodeid") === nodeId &&
      element.getAttribute("data-handleid") === handleId
    ) {
      return readPort(element);
    }
  }
  return null;
}

export function findCanvasPortCandidate(
  clientX: number,
  clientY: number,
  expectedKind: CanvasHandleKind,
  previous: CanvasPortRef | null,
): CanvasPortRef | null {
  const pointer = { x: clientX, y: clientY };
  const ports = Array.from(
    document.querySelectorAll<HTMLElement>(".canvas-port-handle"),
  ).flatMap((element) => {
    const port = readPort(element);
    return port?.kind === expectedKind ? [port] : [];
  });

  if (previous) {
    const refreshed = ports.find(
      (port) => port.nodeId === previous.nodeId && port.handleId === previous.handleId,
    );
    if (refreshed && distance(pointer, refreshed.screenPoint) <= EXIT_RADIUS) {
      return refreshed;
    }
  }

  const candidates = ports
    .map((port) => ({ port, distance: distance(pointer, port.screenPoint) }))
    .filter((candidate) => candidate.distance <= ENTER_RADIUS)
    .sort((left, right) => left.distance - right.distance);
  const closest = candidates[0];
  const second = candidates[1];
  if (!closest) return null;
  if (second && second.distance - closest.distance < AMBIGUITY_DISTANCE) return null;
  return closest.port;
}
