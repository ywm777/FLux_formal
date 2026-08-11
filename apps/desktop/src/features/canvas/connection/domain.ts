import type { Connection } from "@xyflow/react";
import type {
  CanvasHandleAnchor,
  CanvasHandleKind,
} from "../canvasHandles.js";

export interface CanvasPoint {
  x: number;
  y: number;
}

export type CanvasPortCapacity = "one" | "many";

export interface CanvasPortRef {
  nodeId: string;
  handleId: string;
  portId: string;
  kind: CanvasHandleKind;
  anchor: CanvasHandleAnchor;
  screenPoint: CanvasPoint;
}

export interface CanvasSessionPort extends CanvasPortRef {
  flowPoint: CanvasPoint;
}

export type ConnectionValidationReason =
  | "missing-node"
  | "missing-port"
  | "same-node"
  | "incompatible-type"
  | "duplicate"
  | "source-occupied"
  | "target-occupied"
  | "cycle";

export interface CanvasConnectionCandidate {
  port: CanvasPortRef;
  flowPoint: CanvasPoint;
  attemptedConnection: Connection | null;
  connection: Connection | null;
  reason: ConnectionValidationReason | null;
}

interface ActiveConnectionSession {
  transactionId: number;
  pointerId: number;
  pointer: CanvasPoint;
  candidate: CanvasConnectionCandidate | null;
}

export type CanvasConnectionSession =
  | { mode: "idle" }
  | (ActiveConnectionSession & {
      mode: "creating";
      fixed: CanvasSessionPort;
    })
  | (ActiveConnectionSession & {
      mode: "reconnecting";
      edgeId: string;
      endpoint: "source" | "target";
      origin: CanvasSessionPort;
    })
  | {
      mode: "settling";
      transactionId: number;
      pointerId: number;
      selectedEdgeId: string | null;
    };

export interface FluxConnectionDraft {
  movingEndpoint: "source" | "target";
  pointer: CanvasPoint;
  source?: CanvasPoint;
  target?: CanvasPoint;
  sourceAnchor?: CanvasHandleAnchor;
  targetAnchor?: CanvasHandleAnchor;
  status: "pending" | "valid" | "invalid";
}

export function isActiveConnectionSession(
  session: CanvasConnectionSession,
): session is Extract<CanvasConnectionSession, { mode: "creating" | "reconnecting" }> {
  return session.mode === "creating" || session.mode === "reconnecting";
}
