import { ZOOM } from "@flux/shared";
import type { Viewport } from "@flux/workflow-schema";

export interface Point {
  x: number;
  y: number;
}

/** 屏幕坐标 → 画布坐标 */
export function screenToCanvas(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.zoom, y: (p.y - vp.y) / vp.zoom };
}

/** 画布坐标 → 屏幕坐标 */
export function canvasToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.zoom + vp.x, y: p.y * vp.zoom + vp.y };
}

export function clampZoom(zoom: number): number {
  return Math.min(ZOOM.MAX, Math.max(ZOOM.MIN, zoom));
}

/** 以光标为锚点缩放，保证锚点下的画布坐标不变 */
export function zoomAtPoint(
  vp: Viewport,
  anchor: Point,
  nextZoom: number,
): Viewport {
  const zoom = clampZoom(nextZoom);
  const canvasPoint = screenToCanvas(anchor, vp);
  return {
    zoom,
    x: anchor.x - canvasPoint.x * zoom,
    y: anchor.y - canvasPoint.y * zoom,
  };
}

export function pan(vp: Viewport, dx: number, dy: number): Viewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy };
}
