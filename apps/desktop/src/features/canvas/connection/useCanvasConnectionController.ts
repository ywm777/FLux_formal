import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Connection, Edge, Node } from "@xyflow/react";
import type { FluxNodeData } from "../FluxNode.js";
import type { CanvasHandleKind } from "../canvasHandles.js";
import type {
  CanvasConnectionCandidate,
  CanvasConnectionSession,
  CanvasPoint,
  FluxConnectionDraft,
} from "./domain.js";
import { isActiveConnectionSession } from "./domain.js";
import {
  beginCreateConnection,
  beginReconnectConnection,
  idleConnectionSession,
  moveConnectionSession,
  settleConnectionSession,
} from "./machine.js";
import {
  findCanvasPortCandidate,
  getCanvasPort,
} from "./portRegistry.js";
import {
  connectionValidationMessage,
  resolveCanvasConnectionStart,
  validateCanvasConnection,
} from "./policy.js";

interface PointerStart {
  pointerId: number;
  clientX: number;
  clientY: number;
}

interface CanvasConnectionControllerOptions {
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  selectedEdgeId: string | null;
  screenToFlowPosition: (point: CanvasPoint) => CanvasPoint | null;
  onCreate: (connection: Connection) => void;
  onReconnect: (edgeId: string, connection: Connection) => void;
  onDuplicate: (connection: Connection) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onNotice: (message: string) => void;
  onGestureStart?: () => void;
}

export interface CanvasConnectionController {
  session: CanvasConnectionSession;
  draft: FluxConnectionDraft | null;
  beginFromPort: (nodeId: string, handleId: string, pointer: PointerStart) => void;
  cancel: () => void;
}

function connectionForCandidate(
  session: Extract<CanvasConnectionSession, { mode: "creating" | "reconnecting" }>,
  candidateNodeId: string,
  candidateHandleId: string,
  edges: Edge[],
): Connection | null {
  if (session.mode === "creating") {
    return session.fixed.kind === "source"
      ? {
          source: session.fixed.nodeId,
          sourceHandle: session.fixed.handleId,
          target: candidateNodeId,
          targetHandle: candidateHandleId,
        }
      : {
          source: candidateNodeId,
          sourceHandle: candidateHandleId,
          target: session.fixed.nodeId,
          targetHandle: session.fixed.handleId,
        };
  }

  const edge = edges.find((candidate) => candidate.id === session.edgeId);
  if (!edge) return null;
  return session.endpoint === "source"
    ? {
        source: candidateNodeId,
        sourceHandle: candidateHandleId,
        target: edge.target,
        targetHandle: edge.targetHandle ?? null,
      }
    : {
        source: edge.source,
        sourceHandle: edge.sourceHandle ?? null,
        target: candidateNodeId,
        targetHandle: candidateHandleId,
      };
}

function expectedCandidateKind(
  session: Extract<CanvasConnectionSession, { mode: "creating" | "reconnecting" }>,
): CanvasHandleKind {
  if (session.mode === "reconnecting") return session.endpoint;
  return session.fixed.kind === "source" ? "target" : "source";
}

export function useCanvasConnectionController(
  options: CanvasConnectionControllerOptions,
): CanvasConnectionController {
  const [session, setSession] = useState<CanvasConnectionSession>(idleConnectionSession);
  const sessionRef = useRef<CanvasConnectionSession>(idleConnectionSession);
  const transactionRef = useRef(0);
  const optionsRef = useRef(options);
  const nodesRef = useRef(options.nodes);
  const edgesRef = useRef(options.edges);
  const selectedEdgeIdRef = useRef(options.selectedEdgeId);
  optionsRef.current = options;
  nodesRef.current = options.nodes;
  edgesRef.current = options.edges;
  selectedEdgeIdRef.current = options.selectedEdgeId;

  const updateSession = useCallback((next: CanvasConnectionSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const releaseAfterEvent = useCallback((transactionId: number) => {
    window.requestAnimationFrame(() => {
      const current = sessionRef.current;
      if (current.mode === "settling" && current.transactionId === transactionId) {
        updateSession(idleConnectionSession);
      }
    });
  }, [updateSession]);

  const cancel = useCallback(() => {
    const current = sessionRef.current;
    if (!isActiveConnectionSession(current)) return;
    const settling = settleConnectionSession(current);
    updateSession(settling);
    if (settling.mode === "settling") releaseAfterEvent(settling.transactionId);
  }, [releaseAfterEvent, updateSession]);

  const beginFromPort = useCallback((
    nodeId: string,
    handleId: string,
    pointer: PointerStart,
  ) => {
    const previousSession = sessionRef.current;
    if (previousSession.mode === "settling") {
      updateSession(idleConnectionSession);
    } else if (previousSession.mode !== "idle") {
      return;
    }
    const port = getCanvasPort(nodeId, handleId);
    const currentOptions = optionsRef.current;
    const flowPoint = port
      ? currentOptions.screenToFlowPosition(port.screenPoint)
      : null;
    if (!port || !flowPoint) return;
    const edges = edgesRef.current;
    const decision = resolveCanvasConnectionStart({
      port,
      nodes: nodesRef.current,
      edges,
      selectedEdgeId: selectedEdgeIdRef.current,
    });
    if (decision.mode === "blocked") {
      currentOptions.onNotice(connectionValidationMessage(decision.reason));
      return;
    }
    currentOptions.onGestureStart?.();
    const transactionId = ++transactionRef.current;

    if (decision.mode === "reconnect") {
      currentOptions.onSelectEdge(decision.edgeId);
      updateSession(beginReconnectConnection({
        transactionId,
        pointerId: pointer.pointerId,
        edgeId: decision.edgeId,
        endpoint: decision.endpoint,
        origin: { ...port, flowPoint },
      }));
      return;
    }

    currentOptions.onSelectEdge(null);
    updateSession(beginCreateConnection({
      transactionId,
      pointerId: pointer.pointerId,
      fixed: { ...port, flowPoint },
    }));
  }, [updateSession]);

  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const current = sessionRef.current;
      if (
        !isActiveConnectionSession(current) ||
        current.pointerId !== event.pointerId
      ) return;
      event.preventDefault();
      event.stopPropagation();
      const currentOptions = optionsRef.current;
      const pointer = currentOptions.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      if (!pointer) return;

      const hit = findCanvasPortCandidate(
        event.clientX,
        event.clientY,
        expectedCandidateKind(current),
        current.candidate?.port ?? null,
      );
      if (!hit) {
        updateSession(moveConnectionSession(current, pointer, null));
        return;
      }
      const proposed = connectionForCandidate(
        current,
        hit.nodeId,
        hit.handleId,
        edgesRef.current,
      );
      const validation = proposed
        ? validateCanvasConnection({
            connection: proposed,
            nodes: nodesRef.current,
            edges: edgesRef.current,
            ignoredEdgeId: current.mode === "reconnecting" ? current.edgeId : null,
          })
        : { connection: null, reason: "missing-node" as const };
      const flowPoint = currentOptions.screenToFlowPosition(hit.screenPoint);
      if (!flowPoint) return;
      const candidate: CanvasConnectionCandidate = {
        port: hit,
        flowPoint,
        attemptedConnection: proposed,
        connection: validation.connection,
        reason: validation.reason,
      };
      updateSession(moveConnectionSession(current, pointer, candidate));
    }

    function finish(event: PointerEvent, commit: boolean) {
      const current = sessionRef.current;
      if (
        !isActiveConnectionSession(current) ||
        current.pointerId !== event.pointerId
      ) return;
      event.preventDefault();
      event.stopPropagation();
      const settling = settleConnectionSession(current);
      updateSession(settling);

      if (commit && current.candidate?.connection) {
        const currentOptions = optionsRef.current;
        if (current.mode === "creating") {
          currentOptions.onCreate(current.candidate.connection);
        } else {
          currentOptions.onReconnect(current.edgeId, current.candidate.connection);
          currentOptions.onSelectEdge(current.edgeId);
        }
      } else if (commit && current.candidate?.reason) {
        if (
          current.candidate.reason === "duplicate" &&
          current.candidate.attemptedConnection
        ) {
          optionsRef.current.onDuplicate(current.candidate.attemptedConnection);
        }
        optionsRef.current.onNotice(connectionValidationMessage(current.candidate.reason));
      }
      if (settling.mode === "settling") releaseAfterEvent(settling.transactionId);
    }

    const onPointerUp = (event: PointerEvent) => finish(event, true);
    const onPointerCancel = (event: PointerEvent) => finish(event, false);
    const onBlur = () => cancel();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isActiveConnectionSession(sessionRef.current)) return;
      event.preventDefault();
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("pointermove", onPointerMove, { capture: true });
    window.addEventListener("pointerup", onPointerUp, { capture: true });
    window.addEventListener("pointercancel", onPointerCancel, { capture: true });
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("pointermove", onPointerMove, { capture: true });
      window.removeEventListener("pointerup", onPointerUp, { capture: true });
      window.removeEventListener("pointercancel", onPointerCancel, { capture: true });
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onKeyDown, { capture: true });
    };
  }, [cancel, releaseAfterEvent, updateSession]);

  const draft = useMemo<FluxConnectionDraft | null>(() => {
    if (!isActiveConnectionSession(session)) return null;
    const status = session.candidate
      ? session.candidate.connection ? "valid" : "invalid"
      : "pending";
    if (session.mode === "creating") {
      const movingEndpoint = session.fixed.kind === "source" ? "target" : "source";
      return {
        movingEndpoint,
        pointer: session.pointer,
        source: movingEndpoint === "target" ? session.fixed.flowPoint : session.pointer,
        target: movingEndpoint === "source" ? session.fixed.flowPoint : session.pointer,
        sourceAnchor: movingEndpoint === "target"
          ? session.fixed.anchor
          : session.candidate?.port.anchor,
        targetAnchor: movingEndpoint === "source"
          ? session.fixed.anchor
          : session.candidate?.port.anchor,
        status,
      };
    }
    return {
      movingEndpoint: session.endpoint,
      pointer: session.pointer,
      source: session.endpoint === "source" ? session.pointer : undefined,
      target: session.endpoint === "target" ? session.pointer : undefined,
      sourceAnchor: session.endpoint === "source" ? session.candidate?.port.anchor : undefined,
      targetAnchor: session.endpoint === "target" ? session.candidate?.port.anchor : undefined,
      status,
    };
  }, [session]);

  return { session, draft, beginFromPort, cancel };
}
