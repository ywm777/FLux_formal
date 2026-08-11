import type {
  CanvasConnectionCandidate,
  CanvasConnectionSession,
  CanvasPoint,
  CanvasSessionPort,
} from "./domain.js";

export const idleConnectionSession: CanvasConnectionSession = { mode: "idle" };

export function beginCreateConnection(input: {
  transactionId: number;
  pointerId: number;
  fixed: CanvasSessionPort;
}): CanvasConnectionSession {
  return {
    mode: "creating",
    transactionId: input.transactionId,
    pointerId: input.pointerId,
    fixed: input.fixed,
    pointer: input.fixed.flowPoint,
    candidate: null,
  };
}

export function beginReconnectConnection(input: {
  transactionId: number;
  pointerId: number;
  edgeId: string;
  endpoint: "source" | "target";
  origin: CanvasSessionPort;
}): CanvasConnectionSession {
  return {
    mode: "reconnecting",
    transactionId: input.transactionId,
    pointerId: input.pointerId,
    edgeId: input.edgeId,
    endpoint: input.endpoint,
    origin: input.origin,
    pointer: input.origin.flowPoint,
    candidate: null,
  };
}

export function moveConnectionSession(
  session: CanvasConnectionSession,
  pointer: CanvasPoint,
  candidate: CanvasConnectionCandidate | null,
): CanvasConnectionSession {
  if (session.mode !== "creating" && session.mode !== "reconnecting") return session;
  return {
    ...session,
    pointer: candidate?.connection ? candidate.flowPoint : pointer,
    candidate,
  };
}

export function settleConnectionSession(
  session: CanvasConnectionSession,
): CanvasConnectionSession {
  if (session.mode !== "creating" && session.mode !== "reconnecting") return session;
  return {
    mode: "settling",
    transactionId: session.transactionId,
    pointerId: session.pointerId,
    selectedEdgeId: session.mode === "reconnecting" ? session.edgeId : null,
  };
}
