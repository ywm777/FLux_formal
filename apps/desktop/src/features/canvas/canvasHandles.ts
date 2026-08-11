export type CanvasHandleKind = "source" | "target";
export type CanvasHandleAnchor = "top" | "right" | "bottom" | "left";

const CANVAS_HANDLE_ANCHORS: CanvasHandleAnchor[] = ["top", "right", "bottom", "left"];

const HANDLE_PREFIX = "flux-handle";

export function createCanvasHandleId(
  kind: CanvasHandleKind,
  portId: string,
  anchor: CanvasHandleAnchor,
): string {
  return `${HANDLE_PREFIX}:${kind}:${anchor}:${encodeURIComponent(portId)}`;
}

export function parseCanvasHandleId(
  id: string | null | undefined,
): { kind: CanvasHandleKind; portId: string; anchor: CanvasHandleAnchor } | null {
  if (!id?.startsWith(`${HANDLE_PREFIX}:`)) return null;
  const [, kind, anchor, encodedPort] = id.split(":");
  if (
    (kind !== "source" && kind !== "target") ||
    !isCanvasHandleAnchor(anchor) ||
    !encodedPort
  ) return null;
  return {
    kind,
    anchor: anchor as CanvasHandleAnchor,
    portId: decodeURIComponent(encodedPort),
  };
}

export function isCanvasHandleAnchor(value: unknown): value is CanvasHandleAnchor {
  return typeof value === "string" && (CANVAS_HANDLE_ANCHORS as string[]).includes(value);
}

export function normalizeCanvasHandleAnchor(
  value: unknown,
  fallback: CanvasHandleAnchor,
): CanvasHandleAnchor {
  return isCanvasHandleAnchor(value) ? value : fallback;
}
