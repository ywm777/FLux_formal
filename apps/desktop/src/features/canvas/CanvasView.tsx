import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  SelectionMode,
  ViewportPortal,
  applyEdgeChanges,
  applyNodeChanges,
  getNodesBounds,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Drawer,
  carrierColorVar,
  type CommandItem,
  type FormValue,
} from "@flux/ui";
import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  type ExecutionDetail,
  type ExecutionNodeInputs,
  type NodeRunRecord,
  type WorkflowRecord,
} from "@flux/shared";
import {
  safeParseGraph,
  type CanvasGroup,
} from "@flux/workflow-schema";
import { registry, catalogNodes } from "../../lib/registry.js";
import {
  getNodeDefinitionSummary,
  getNodeTypeName,
} from "../../lib/nodeDisplay.js";
import {
  approveExecutionAndContinue,
  runDraftExecution,
  type ExecutionResponse,
} from "../../lib/executionGateway.js";
import {
  formatExecutionMessage,
} from "../../lib/executionDisplay.js";
import { formatProductErrorMessage } from "../../lib/productError.js";
import { defaultsFromSchema, toFormSchema } from "../../lib/schemaBridge.js";
import {
  getWorkflowTemplate,
} from "../../lib/workflowTemplates.js";
import { useCanvasStore } from "../../store/canvasStore.js";
import { useAppStore } from "../../store/appStore.js";
import { FluxNode, type FluxNodeData } from "./FluxNode.js";
import { FluxConnectionDraftLayer, FluxEdge } from "./FluxEdge.js";
import { NodeInspector } from "./NodeInspector.js";
import { ConflictDialog } from "./ConflictDialog.js";
import { ContextMenu, type ContextMenuItem } from "./ContextMenu.js";
import { CanvasNodePalette } from "./CanvasNodePalette.js";
import { ShareWorkflowDialog } from "../sharing/ShareWorkflowDialog.js";
import {
  CanvasSelectionLayer,
  type CanvasGroupLayout,
} from "./CanvasSelectionLayer.js";
import { buildNodeBusinessPresentation } from "./nodeBusinessSurface.js";
import {
  createCanvasHandleId,
} from "./canvasHandles.js";
import {
  createEdgeAtomically,
  reconnectEdgeAtomically,
} from "./connection/commands.js";
import {
  validateCanvasConnection,
} from "./connection/policy.js";
import { useCanvasConnectionController } from "./connection/useCanvasConnectionController.js";
import { useCanvasSelectionController } from "./selection/useCanvasSelectionController.js";
import { useCanvasHistoryController } from "./history/useCanvasHistoryController.js";
import {
  createFluxNode,
  fromWorkflowGraph,
  graphSignature,
  toWorkflowGraph,
} from "./graphBridge.js";
import {
  isEditableShortcutTarget,
  matchesShortcut,
} from "../../lib/keyboardShortcuts.js";
import {
  useRegisterWorkflowCommands,
  useWorkflowCommands,
} from "../../app/WorkflowCommandProvider.js";
import { useCanvasSession } from "./session/useCanvasSession.js";

let counter = 0;
const nextId = () => `n${++counter}`;
let groupCounter = 0;
const nextGroupId = () => `group-${++groupCounter}`;
const NODE_COLLISION_X = 330;
const NODE_COLLISION_Y = 170;
const NODE_SPACING_X = 380;
const NODE_SPACING_Y = 190;

interface GraphSnapshot {
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
  groups: CanvasGroup[];
}

function missingRuntimeInputFields(
  node: Node<FluxNodeData>,
  value: Record<string, unknown>,
  hasUpstream: boolean,
): string[] {
  const definition = registry.resolve(node.data.fluxType);
  if (hasUpstream && definition?.runtimeInputPolicy === "fallback") return [];
  const schema = definition?.runtimeInputSchema;
  return (schema?.required ?? []).filter((key) => {
    const fieldValue = value[key];
    return (
      fieldValue === undefined ||
      fieldValue === null ||
      (typeof fieldValue === "string" && !fieldValue.trim())
    );
  });
}

function bumpCounter(nodes: Node<FluxNodeData>[]) {
  for (const n of nodes) {
    const match = /^n(\d+)$/.exec(n.id);
    if (match) counter = Math.max(counter, Number(match[1]));
  }
}

function bumpGroupCounter(groups: CanvasGroup[]) {
  for (const group of groups) {
    const match = /^group-(\d+)$/.exec(group.id);
    if (match) groupCounter = Math.max(groupCounter, Number(match[1]));
  }
}

function seedNodes(): Node<FluxNodeData>[] {
  return [];
}

function instantiateWorkflowTemplate(templateId: string): {
  nodes: Node<FluxNodeData>[];
  edges: Edge[];
} | null {
  const template = getWorkflowTemplate(templateId);
  if (!template) return null;

  const nodeByKey = new Map<string, Node<FluxNodeData>>();
  const nodes = template.nodes.flatMap((item) => {
    const definition = registry.resolve(item.type);
    if (!definition) return [];
    const node = createFluxNode(definition, item.position, nextId());
    node.data.config = {
      ...defaultsFromSchema(definition.configSchema),
      ...(item.config ?? {}),
    };
    if (item.label) node.data.label = item.label;
    nodeByKey.set(item.key, node);
    return [node];
  });

  const edges = template.edges.flatMap((item, index): Edge[] => {
    const source = nodeByKey.get(item.source);
    const target = nodeByKey.get(item.target);
    if (!source || !target) return [];
    const sourcePort = item.sourceHandle ?? source.data.outputs[0]?.id;
    const targetPort = item.targetHandle ?? target.data.inputs[0]?.id;
    if (!sourcePort || !targetPort) return [];
    const targetIsErrorHandler = registry.resolve(target.data.fluxType)?.executionRole === "error-handler";
    return [
      {
        id: `template-edge-${index}-${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        sourceHandle: createCanvasHandleId("source", sourcePort, "right"),
        targetHandle: createCanvasHandleId("target", targetPort, "left"),
        data: { route: targetIsErrorHandler ? "error" : "normal" },
        type: "default",
      },
    ];
  });

  return { nodes, edges };
}

const paletteItems: CommandItem[] = catalogNodes.map((def) => ({
  id: def.id,
  label: def.name,
  description: getNodeDefinitionSummary(def),
  group: def.category,
  keywords: [def.id, def.carrier, def.category],
  accent: carrierColorVar[def.carrier as keyof typeof carrierColorVar],
}));

const TERMINAL_NODE_RUN_STATUS = new Set(["success", "failed", "skipped"]);

function shouldIgnoreCanvasDoubleClick(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(".react-flow__node, .react-flow__edge, .react-flow__edge-label, .canvas-node-palette, .canvas-node-toolbar, button, input, textarea"))
  );
}

function cloneConfig(config: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(config) as Record<string, unknown>;
  } catch {
    return { ...config };
  }
}

function cloneGraphSnapshot(snapshot: GraphSnapshot): GraphSnapshot {
  return {
    nodes: snapshot.nodes.map((node): Node<FluxNodeData> => ({
      ...node,
      selected: false,
      position: { ...node.position },
      data: {
        ...node.data,
        inputs: node.data.inputs.map((input) => ({ ...input })),
        outputs: node.data.outputs.map((output) => ({ ...output })),
        config: cloneConfig(node.data.config),
        actions: undefined,
        run: undefined,
      },
    })),
    edges: snapshot.edges.map((edge) => ({ ...edge, selected: false })),
    groups: snapshot.groups.map((group) => ({
      ...group,
      nodeIds: [...group.nodeIds],
    })),
  };
}

function equalGraphSnapshots(
  left: GraphSnapshot,
  right: GraphSnapshot,
): boolean {
  return graphSignature(left.nodes, left.edges, "", left.groups) ===
    graphSignature(right.nodes, right.edges, "", right.groups);
}

function getExecutionDisplayId(
  display: ExecutionDetail | ExecutionResponse | null,
): string | null {
  if (!display) return null;
  return "executionId" in display ? display.executionId : display.id;
}

function isGraphChangingNodeChange(change: NodeChange): boolean {
  return change.type !== "select" && change.type !== "dimensions";
}

function isExecutionAffectingNodeChange(change: NodeChange): boolean {
  return (
    change.type !== "position" &&
    change.type !== "select" &&
    change.type !== "dimensions"
  );
}

function isGraphChangingEdgeChange(change: EdgeChange): boolean {
  return change.type !== "select";
}

function isNodePositionOccupied(
  position: { x: number; y: number },
  node: Node<FluxNodeData>,
): boolean {
  return (
    Math.abs(position.x - node.position.x) < NODE_COLLISION_X &&
    Math.abs(position.y - node.position.y) < NODE_COLLISION_Y
  );
}

function findOpenNodePosition(
  nodes: Node<FluxNodeData>[],
  desired: { x: number; y: number },
): { x: number; y: number } {
  if (!nodes.some((node) => isNodePositionOccupied(desired, node))) {
    return desired;
  }

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const column = Math.floor(attempt / 4);
    const row = (attempt % 4) + 1;
    const candidate = {
      x: desired.x + column * NODE_SPACING_X,
      y: desired.y + row * NODE_SPACING_Y,
    };
    if (!nodes.some((node) => isNodePositionOccupied(candidate, node))) {
      return candidate;
    }
  }

  return {
    x: desired.x + NODE_SPACING_X,
    y: desired.y + NODE_SPACING_Y * 2,
  };
}

// Mirrors backend topological ordering so canvas step badges match draft execution.
function compileCanvasExecutionOrder(
  nodes: Node<FluxNodeData>[],
  edges: Edge[],
): string[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  for (const node of nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }

  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = nodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .map((node) => node.id);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) continue;
    order.push(id);

    for (const next of adjacency.get(id) ?? []) {
      const nextIndegree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, nextIndegree);
      if (nextIndegree === 0) queue.push(next);
    }
  }

  return order.length === nodes.length ? order : nodes.map((node) => node.id);
}

export function CanvasView({ active = true }: { active?: boolean }) {
  const workflowCommands = useWorkflowCommands();
  const [nodes, setNodes] = useNodesState<Node<FluxNodeData>>(
    seedNodes(),
  );
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [groups, setGroups] = useState<CanvasGroup[]>([]);
  const selection = useCanvasSelectionController({ groups });
  const {
    nodeIds: selectedNodeIds,
    primaryNodeId: selectedId,
    groupId: selectedGroupId,
    edgeId: selectedEdgeId,
    inspectingNodeId: inspectingId,
  } = selection.state;
  const historyValue = useMemo<GraphSnapshot>(
    () => ({ nodes, edges, groups }),
    [nodes, edges, groups],
  );
  const history = useCanvasHistoryController({
    value: historyValue,
    clone: cloneGraphSnapshot,
    equals: equalGraphSnapshots,
    limit: 80,
  });
  const recordHistory = history.record;
  const [error, setError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteAnchor, setPaletteAnchor] = useState<{ x: number; y: number } | null>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [testRunDetail, setTestRunDetail] = useState<ExecutionDetail | null>(null);
  const [testRunResult, setTestRunResult] = useState<ExecutionResponse | null>(null);
  const [testRunError, setTestRunError] = useState<string | null>(null);
  const runtimeInputDraftsRef = useRef<ExecutionNodeInputs>({});
  const [runtimeInputRevision, setRuntimeInputRevision] = useState(0);
  const [runtimeInputError, setRuntimeInputError] = useState<string | null>(null);
  const insertPos = useRef<{ x: number; y: number } | null>(null);
  const insertSourceId = useRef<string | null>(null);
  const rf = useRef<ReactFlowInstance<Node<FluxNodeData>, Edge> | null>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    kind: "pane" | "node" | "edge";
    nodeId?: string;
    edgeId?: string;
  } | null>(null);

  const setMode = useAppStore((s) => s.setMode);
  const applyRecord = useCanvasStore((s) => s.applyRecord);
  const testing = useCanvasStore((s) => s.testing);

  const fitViewRequestedRef = useRef(false);
  const fitViewTimerRef = useRef<number | null>(null);
  const playbackTokenRef = useRef(0);
  const selectedEdgeDragRef = useRef<Edge | null>(null);
  const edgeIdCounterRef = useRef(0);
  const suppressNodeSelectionUntilRef = useRef(0);
  const groupDragRef = useRef<{
    pointerId: number;
    groupId: string;
    startX: number;
    startY: number;
    zoom: number;
    positions: Map<string, { x: number; y: number }>;
  } | null>(null);

  const nodeTypes = useMemo(() => ({ flux: FluxNode }), []);
  const edgeTypes = useMemo(() => ({ flux: FluxEdge }), []);
  const inspectingNode = nodes.find((n) => n.id === inspectingId) ?? null;
  const workflowTitle = useCanvasStore((s) => s.title);
  const workflowId = useCanvasStore((s) => s.workflowId);
  const setWorkflowTitle = useCanvasStore((s) => s.setTitle);
  const testRunDisplay = testRunDetail ?? testRunResult;

  const scheduleFitView = useCallback(() => {
    fitViewRequestedRef.current = true;
  }, []);

  const cancelScheduledFitView = useCallback(() => {
    fitViewRequestedRef.current = false;
    if (fitViewTimerRef.current) {
      window.clearTimeout(fitViewTimerRef.current);
      fitViewTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!fitViewRequestedRef.current) return;
    fitViewTimerRef.current = window.setTimeout(() => {
      fitViewRequestedRef.current = false;
      fitViewTimerRef.current = null;
      void rf.current?.fitView({ duration: 0, padding: 0.28, maxZoom: 1 });
    }, 80);
    return () => {
      if (fitViewTimerRef.current) {
        window.clearTimeout(fitViewTimerRef.current);
        fitViewTimerRef.current = null;
      }
    };
  }, [nodes, edges]);

  const resetCanvasDraft = useCallback(function resetCanvasDraft(
    templateId?: string,
  ) {
    const freshNodes = seedNodes();
    const templateGraph = templateId
      ? instantiateWorkflowTemplate(templateId)
      : null;
    if (templateGraph) {
      freshNodes.splice(0, freshNodes.length, ...templateGraph.nodes);
    }
    const freshEdges = templateGraph?.edges ?? [];
    bumpCounter(freshNodes);
    setNodes(freshNodes);
    setEdges(freshEdges);
    setGroups([]);
    selection.reset();
    setPaletteOpen(false);
    setPaletteAnchor(null);
    setTestRunDetail(null);
    setTestRunResult(null);
    setTestRunError(null);
    runtimeInputDraftsRef.current = {};
    setRuntimeInputRevision((revision) => revision + 1);
    setRuntimeInputError(null);
    setMenu(null);
    insertPos.current = null;
    insertSourceId.current = null;
    history.reset({ nodes: freshNodes, edges: freshEdges, groups: [] });
    scheduleFitView();
  }, [
    setNodes,
    setEdges,
    scheduleFitView,
    selection.reset,
    history.reset,
  ]);

  const applyWorkflowRecordToCanvas = useCallback(
    (record: WorkflowRecord, preserveDirtyTitle = false) => {
      const local = useCanvasStore.getState();
      const localTitle = local.title;
      const keepLocalTitle = preserveDirtyTitle && local.titleDirty;
      const parsed = safeParseGraph(record.graph);
      if (!parsed.success) {
        useCanvasStore.getState().setStatus("error", "工作流图数据不可读取");
        return null;
      }

      const { nodes: ln, edges: le, groups: loadedGroups } = fromWorkflowGraph(parsed.data);
      const persistedGraphTitle = parsed.data.meta.title ?? record.title;
      bumpCounter(ln);
      bumpGroupCounter(loadedGroups);
      setNodes(ln);
      setEdges(le);
      setGroups(loadedGroups);
      runtimeInputDraftsRef.current = {};
      setRuntimeInputRevision((revision) => revision + 1);
      setRuntimeInputError(null);
      selection.reset();
      setPaletteOpen(false);
      setPaletteAnchor(null);
      setMenu(null);
      history.reset({ nodes: ln, edges: le, groups: loadedGroups });
      const loadedSignature = graphSignature(
        ln,
        le,
        persistedGraphTitle,
        loadedGroups,
      );
      applyRecord(record);
      if (keepLocalTitle && localTitle !== record.title) {
        useCanvasStore.getState().setTitle(localTitle);
      }
      scheduleFitView();
      return loadedSignature;
    },
    [
      applyRecord,
      setNodes,
      setEdges,
      scheduleFitView,
      selection.reset,
      history.reset,
    ],
  );

  const signature = useMemo(
    () => graphSignature(nodes, edges, workflowTitle, groups),
    [nodes, edges, groups, workflowTitle],
  );
  const createGraph = useCallback(
    () =>
      toWorkflowGraph(
        useCanvasStore.getState().workflowId ?? "wf_canvas",
        nodes,
        edges,
        rf.current?.getViewport() ?? { x: 0, y: 0, zoom: 1 },
        workflowTitle,
        groups,
      ),
    [edges, groups, nodes, workflowTitle],
  );
  const {
    conflict,
    saveNow,
    publish: publishSession,
    openWorkflow,
    createDraft,
    keepLocalVersion,
    useStoredVersion,
  } = useCanvasSession({
    active,
    applyWorkflowRecord: applyWorkflowRecordToCanvas,
    resetCanvasDraft,
    createGraph,
    signature,
  });

  const restoreGraphSnapshot = useCallback(
    (snapshot: GraphSnapshot) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
      setGroups(snapshot.groups);
      selection.clearCanvas();
      setPaletteOpen(false);
      setPaletteAnchor(null);
      setMenu(null);
    },
    [setNodes, setEdges, selection.clearCanvas],
  );

  const undoGraph = useCallback(() => {
    const snapshot = history.undo();
    if (snapshot) restoreGraphSnapshot(snapshot);
  }, [history.undo, restoreGraphSnapshot]);

  const redoGraph = useCallback(() => {
    const snapshot = history.redo();
    if (snapshot) restoreGraphSnapshot(snapshot);
  }, [history.redo, restoreGraphSnapshot]);

  const clearNodeRunState = useCallback(function clearNodeRunState() {
    setNodes((current) => {
      if (!current.some((node) => node.data.run)) return current;
      return current.map((node) =>
        node.data.run
          ? { ...node, data: { ...node.data, run: undefined } }
          : node,
      );
    });
  }, [setNodes]);

  const initializeNodeRunState = useCallback(function initializeNodeRunState() {
    setNodes((current) =>
      current.map((node) => ({
        ...node,
        data: {
          ...node.data,
          run: { status: NODE_RUN_STATUS.PENDING },
        },
      })),
    );
  }, [setNodes]);

  const clearStaleRunState = useCallback(function clearStaleRunState() {
    playbackTokenRef.current += 1;
    clearNodeRunState();
    setTestRunDetail(null);
    setTestRunResult(null);
    setTestRunError(null);
    setRuntimeInputError(null);
  }, [clearNodeRunState]);

  const onCanvasNodesChange = useCallback(
    (changes: NodeChange<Node<FluxNodeData>>[]) => {
      const graphChanges = changes.filter(isGraphChangingNodeChange);
      if (graphChanges.length > 0) recordHistory();
      if (changes.some(isExecutionAffectingNodeChange)) clearStaleRunState();
      setNodes((current) => applyNodeChanges(changes, current));
    },
    [recordHistory, clearStaleRunState, setNodes],
  );

  const onCanvasSelectionChange = useCallback((flowSelection: {
    nodes: Node<FluxNodeData>[];
    edges: Edge[];
  }) => {
    const lockedEdgeId = selectedEdgeDragRef.current?.id ?? null;
    const selectedEdge =
      flowSelection.edges.length === 1 ? flowSelection.edges[0] : null;
    if (selectedEdge) {
      selectedEdgeDragRef.current = selectedEdge;
    }
    if (flowSelection.nodes.length > 0 && !lockedEdgeId) {
      selectedEdgeDragRef.current = null;
    }
    selection.syncFlowSelection({
      nodeIds: flowSelection.nodes.map((node) => node.id),
      edgeId: selectedEdge?.id ?? null,
      lockedEdgeId,
    });
  }, [selection.syncFlowSelection]);

  const onCanvasEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (changes.some(isGraphChangingEdgeChange)) recordHistory();
      if (changes.some(isGraphChangingEdgeChange)) clearStaleRunState();
      const selectedChange = changes.find((change) => change.type === "select" && change.selected);
      if (selectedChange?.type === "select" && selectedChange.selected) {
        selection.selectEdge(selectedChange.id, "preserve");
      } else {
        const lockedEdgeId = selectedEdgeDragRef.current?.id ?? null;
        if (lockedEdgeId) {
          selection.selectEdge(lockedEdgeId, "preserve");
        } else {
          for (const change of changes) {
            if (change.type === "select" && !change.selected) {
              selection.removeEdge(change.id);
            }
          }
        }
      }
      setEdges((current) => applyEdgeChanges(changes, current));
    },
    [
      recordHistory,
      clearStaleRunState,
      setEdges,
      selection.selectEdge,
      selection.removeEdge,
    ],
  );

  const applyNodeRunState = useCallback(function applyNodeRunState(
    runs: NodeRunRecord[],
  ) {
    const runMap = new Map(runs.map((run) => [run.nodeId, run]));
    setNodes((current) =>
      current.map((node) => {
        const run = runMap.get(node.id);
        if (!run) return node;
        return {
          ...node,
          data: {
            ...node.data,
            run: {
              status: run.status,
              outputCount: run.outputs ? Object.keys(run.outputs).length : 0,
              outputs: run.outputs,
              error: run.error,
            },
          },
        };
      }),
    );
  }, [setNodes]);

  const playExecutionResult = useCallback(async function playExecutionResult(
    result: ExecutionResponse,
    token: number,
  ) {
    const finalRunById = new Map(result.runs.map((run) => [run.nodeId, run]));
    const visualRuns: NodeRunRecord[] = result.runs.map((run) => ({
      nodeId: run.nodeId,
      type: run.type,
      status: NODE_RUN_STATUS.PENDING,
    }));

    const publishFrame = () => {
      const snapshot: ExecutionResponse = {
        ...result,
        status: EXECUTION_STATUS.RUNNING,
        runs: visualRuns.map((run) => ({ ...run })),
      };
      applyNodeRunState(snapshot.runs);
      setTestRunDetail(null);
      setTestRunResult(snapshot);
    };

    publishFrame();
    for (const nodeId of result.order) {
      if (playbackTokenRef.current !== token) return;
      const finalRun = finalRunById.get(nodeId);
      const visualRun = visualRuns.find((run) => run.nodeId === nodeId);
      if (!finalRun || !visualRun) continue;
      if (finalRun.status === NODE_RUN_STATUS.PENDING) break;

      if (finalRun.status !== NODE_RUN_STATUS.SKIPPED) {
        visualRun.status = NODE_RUN_STATUS.RUNNING;
        publishFrame();
        await new Promise((resolve) => window.setTimeout(resolve, 420));
      }

      if (playbackTokenRef.current !== token) return;
      Object.assign(visualRun, finalRun);
      publishFrame();
      await new Promise((resolve) => window.setTimeout(resolve, 160));

      if (
        finalRun.status === NODE_RUN_STATUS.RUNNING ||
        (finalRun.status === NODE_RUN_STATUS.FAILED && result.status === EXECUTION_STATUS.FAILED)
      ) {
        break;
      }
    }

    if (playbackTokenRef.current !== token) return;
    applyNodeRunState(result.runs);
    setTestRunResult(result);
  }, [applyNodeRunState]);

  const commitNewConnection = useCallback((connection: Connection) => {
    const validation = validateCanvasConnection({ connection, nodes, edges });
    if (!validation.connection) return;
    const target = nodes.find((node) => node.id === validation.connection?.target);
    const targetIsErrorHandler = target
      ? registry.resolve(target.data.fluxType)?.executionRole === "error-handler"
      : false;
    const result = createEdgeAtomically({
      edges,
      edgeId: `edge-${Date.now().toString(36)}-${++edgeIdCounterRef.current}`,
      connection: validation.connection,
      data: { route: targetIsErrorHandler ? "error" : "normal" },
    });
    if (!result.changed) return;
    setError(null);
    recordHistory();
    clearStaleRunState();
    setEdges(result.edges);
  }, [nodes, edges, recordHistory, clearStaleRunState, setEdges]);

  const commitEdgeReconnect = useCallback((edgeId: string, connection: Connection) => {
    const edgeToReconnect = edges.find((edge) => edge.id === edgeId);
    if (!edgeToReconnect) return;
    const validation = validateCanvasConnection({
      connection,
      nodes,
      edges,
      ignoredEdgeId: edgeId,
    });
    if (!validation.connection) return;
    const target = nodes.find((node) => node.id === validation.connection?.target);
    const targetIsErrorHandler = target
      ? registry.resolve(target.data.fluxType)?.executionRole === "error-handler"
      : false;
    const nextData = {
      ...(edgeToReconnect.data ?? {}),
      route: targetIsErrorHandler ? "error" : "normal",
    };
    const result = reconnectEdgeAtomically({
      edges,
      edgeId,
      connection: validation.connection,
      data: nextData,
    });
    if (!result.changed) return;
    setError(null);
    recordHistory();
    clearStaleRunState();
    setEdges(result.edges);
    selectedEdgeDragRef.current = result.edges.find((edge) => edge.id === edgeId) ?? null;
    selection.selectEdge(edgeId);
  }, [
    nodes,
    edges,
    recordHistory,
    clearStaleRunState,
    setEdges,
    selection.selectEdge,
  ]);

  const selectConnectionEdge = useCallback((edgeId: string | null) => {
    selectedEdgeDragRef.current = edgeId
      ? edges.find((edge) => edge.id === edgeId) ?? null
      : null;
    suppressNodeSelectionUntilRef.current = edgeId ? Date.now() + 1_000 : 0;
    selection.selectEdge(edgeId);
    setPaletteOpen(false);
    setPaletteAnchor(null);
    setMenu(null);
  }, [edges, selection.selectEdge]);

  const screenToFlowPosition = useCallback((point: { x: number; y: number }) =>
    rf.current?.screenToFlowPosition(point) ?? null, []);
  const connectionController = useCanvasConnectionController({
    nodes,
    edges,
    selectedEdgeId,
    screenToFlowPosition,
    onCreate: commitNewConnection,
    onReconnect: commitEdgeReconnect,
    onSelectEdge: selectConnectionEdge,
    onNotice: setError,
    onGestureStart: cancelScheduledFitView,
  });

  const insertNode = useCallback(
    (type: string, pos: { x: number; y: number }) => {
      const def = registry.resolve(type);
      if (!def) return;
      const openPosition = findOpenNodePosition(nodes, pos);
      const node = createFluxNode(def, openPosition, nextId());
      node.data.config = defaultsFromSchema(def.configSchema);
      const sourceId = insertSourceId.current;
      const source = nodes.find((n) => n.id === sourceId);
      const sourcePort = source?.data.outputs[0]?.id;
      const targetPort = node.data.inputs[0]?.id;
      const sourceHandle = sourcePort
        ? createCanvasHandleId("source", sourcePort, "right")
        : undefined;
      const targetHandle = targetPort
        ? createCanvasHandleId("target", targetPort, "left")
        : undefined;
      const insertedEdge: Edge | null =
        sourceId && source && sourceHandle && targetHandle
          ? {
              id: `edge-${sourceId}-${node.id}`,
              source: sourceId,
              target: node.id,
              sourceHandle,
              targetHandle,
              data: { route: def.executionRole === "error-handler" ? "error" : "normal" },
              type: "default",
            }
          : null;
      recordHistory();
      clearStaleRunState();
      setNodes((ns) => [...ns, node]);
      if (insertedEdge) {
        setEdges((es) => [...es, insertedEdge]);
      }
      selection.selectNode(node.id);
      insertSourceId.current = null;
    },
    [
      nodes,
      recordHistory,
      clearStaleRunState,
      setNodes,
      setEdges,
      selection.selectNode,
    ],
  );

  const openNodePaletteAtScreenPoint = useCallback(function openNodePaletteAtScreenPoint(
    point: { x: number; y: number },
  ) {
    const pos = rf.current?.screenToFlowPosition(point);
    insertPos.current = pos ?? { x: 160, y: 160 };
    insertSourceId.current = null;
    setPaletteAnchor({ x: point.x, y: point.y });
    selection.clearCanvas();
    setMenu(null);
    setPaletteOpen(true);
  }, [selection.clearCanvas]);

  const openNodePaletteForAppend = useCallback(function openNodePaletteForAppend(
    sourceId: string,
  ) {
    const source = nodes.find((n) => n.id === sourceId);
    if (!source) return;
    insertSourceId.current = sourceId;
    const pos = { x: source.position.x + 280, y: source.position.y };
    const anchor = rf.current?.flowToScreenPosition(pos) ?? {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    insertPos.current = pos;
    setPaletteAnchor(anchor);
    selection.selectNode(sourceId);
    setMenu(null);
    setPaletteOpen(true);
  }, [nodes, selection.selectNode]);

  const onPaneDoubleClick = useCallback((event: MouseEvent) => {
    if (shouldIgnoreCanvasDoubleClick(event.target)) return;
    openNodePaletteAtScreenPoint({ x: event.clientX, y: event.clientY });
  }, [openNodePaletteAtScreenPoint]);

  const deleteNode = useCallback(
    (id: string) => {
      recordHistory();
      clearStaleRunState();
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
      setGroups((current) => current
        .map((group) => ({
          ...group,
          nodeIds: group.nodeIds.filter((nodeId) => nodeId !== id),
        }))
        .filter((group) => group.nodeIds.length >= 2));
      selection.removeNodes([id]);
    },
    [
      recordHistory,
      clearStaleRunState,
      setNodes,
      setEdges,
      selection.removeNodes,
    ],
  );

  const deleteEdge = useCallback(
    (id: string) => {
      if (!edges.some((edge) => edge.id === id)) return;
      recordHistory();
      clearStaleRunState();
      setEdges((current) => current.filter((edge) => edge.id !== id));
      selection.removeEdge(id);
      if (selectedEdgeDragRef.current?.id === id) {
        selectedEdgeDragRef.current = null;
      }
      setMenu(null);
    },
    [edges, recordHistory, clearStaleRunState, setEdges, selection.removeEdge],
  );

  const openNodeInspector = useCallback((id: string) => {
    selection.selectNode(id, { inspector: "open" });
    setMenu(null);
    setPaletteOpen(false);
    setPaletteAnchor(null);
  }, [selection.selectNode]);

  const duplicateNode = useCallback(
    (id: string) => {
      const source = nodes.find((n) => n.id === id);
      if (!source) return;
      recordHistory();
      clearStaleRunState();
      const copyId = nextId();
      const duplicatePosition = findOpenNodePosition(nodes, {
        x: source.position.x + 36,
        y: source.position.y + 36,
      });
      const duplicate: Node<FluxNodeData> = {
        ...source,
        id: copyId,
        selected: true,
        position: duplicatePosition,
        data: {
          ...source.data,
          label: `${source.data.label} 副本`,
          config: cloneConfig(source.data.config),
          run: undefined,
          actions: undefined,
        },
      };
      setNodes((ns) => [
        ...ns.map((node) => ({ ...node, selected: false })),
        duplicate,
      ]);
      selection.selectNode(copyId);
      setMenu(null);
    },
    [nodes, recordHistory, clearStaleRunState, setNodes, selection.selectNode],
  );

  const deleteSelectedNodes = useCallback(() => {
    const ids = new Set(selectedNodeIds);
    if (ids.size === 0) return;
    recordHistory();
    clearStaleRunState();
    setNodes((current) => current.filter((node) => !ids.has(node.id)));
    setEdges((current) => current.filter(
      (edge) => !ids.has(edge.source) && !ids.has(edge.target),
    ));
    setGroups((current) => current
      .map((group) => ({
        ...group,
        nodeIds: group.nodeIds.filter((nodeId) => !ids.has(nodeId)),
      }))
      .filter((group) => group.nodeIds.length >= 2));
    selection.removeNodes([...ids]);
    setMenu(null);
  }, [
    selectedNodeIds,
    recordHistory,
    clearStaleRunState,
    setNodes,
    setEdges,
    selection.removeNodes,
  ]);

  const duplicateSelectedNodes = useCallback(() => {
    const selected = nodes.filter((node) => selectedNodeIds.includes(node.id));
    if (selected.length === 0) return;
    recordHistory();
    clearStaleRunState();

    const idMap = new Map(selected.map((node) => [node.id, nextId()]));
    const duplicates = selected.map((source): Node<FluxNodeData> => ({
      ...source,
      id: idMap.get(source.id)!,
      selected: true,
      position: {
        x: source.position.x + 48,
        y: source.position.y + 48,
      },
      data: {
        ...source.data,
        label: `${source.data.label} 副本`,
        config: cloneConfig(source.data.config),
        run: undefined,
        actions: undefined,
      },
    }));
    const duplicateEdges = edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge, index): Edge => ({
        ...edge,
        id: `edge-${idMap.get(edge.source)}-${idMap.get(edge.target)}-${index + 1}`,
        source: idMap.get(edge.source)!,
        target: idMap.get(edge.target)!,
        selected: false,
      }));
    const duplicateIds = duplicates.map((node) => node.id);

    setNodes((current) => [
      ...current.map((node) => ({ ...node, selected: false })),
      ...duplicates,
    ]);
    setEdges((current) => [...current, ...duplicateEdges]);
    selection.replaceNodes(duplicateIds);
  }, [
    nodes,
    edges,
    selectedNodeIds,
    recordHistory,
    clearStaleRunState,
    setNodes,
    setEdges,
    selection.replaceNodes,
  ]);

  const mergeSelectedNodes = useCallback(() => {
    const nodeIds = selectedNodeIds.filter((nodeId) =>
      nodes.some((node) => node.id === nodeId),
    );
    if (nodeIds.length < 2) return;
    recordHistory();
    const id = nextGroupId();
    const label = `节点组 ${groupCounter}`;
    const selectedSet = new Set(nodeIds);
    setGroups((current) => [
      ...current
        .map((group) => ({
          ...group,
          nodeIds: group.nodeIds.filter((nodeId) => !selectedSet.has(nodeId)),
        }))
        .filter((group) => group.nodeIds.length >= 2),
      { id, label, nodeIds },
    ]);
    selection.selectGroup(id, nodeIds);
  }, [nodes, selectedNodeIds, recordHistory, selection.selectGroup]);

  const selectGroup = useCallback((group: CanvasGroup) => {
    const nodeIds = group.nodeIds.filter((nodeId) =>
      nodes.some((node) => node.id === nodeId),
    );
    selection.selectGroup(group.id, nodeIds);
    setPaletteOpen(false);
    setPaletteAnchor(null);
    setMenu(null);
  }, [nodes, selection.selectGroup]);

  const ungroupNodes = useCallback((groupId: string) => {
    if (!groups.some((group) => group.id === groupId)) return;
    recordHistory();
    setGroups((current) => current.filter((group) => group.id !== groupId));
    selection.clearGroup(groupId);
  }, [groups, recordHistory, selection.clearGroup]);

  const beginGroupDrag = useCallback((
    event: React.PointerEvent<HTMLButtonElement>,
    group: CanvasGroup,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    selectGroup(group);
    history.beginTransaction();
    event.currentTarget.setPointerCapture(event.pointerId);
    const groupNodeIds = new Set(group.nodeIds);
    groupDragRef.current = {
      pointerId: event.pointerId,
      groupId: group.id,
      startX: event.clientX,
      startY: event.clientY,
      zoom: rf.current?.getViewport().zoom ?? 1,
      positions: new Map(
        nodes
          .filter((node) => groupNodeIds.has(node.id))
          .map((node) => [node.id, { ...node.position }]),
      ),
    };
  }, [nodes, history.beginTransaction, selectGroup]);

  const moveGroup = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = (event.clientX - drag.startX) / drag.zoom;
    const deltaY = (event.clientY - drag.startY) / drag.zoom;
    setNodes((current) => current.map((node) => {
      const start = drag.positions.get(node.id);
      return start
        ? {
            ...node,
            position: {
              x: start.x + deltaX,
              y: start.y + deltaY,
            },
          }
        : node;
    }));
  }, [setNodes]);

  const endGroupDrag = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = groupDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    groupDragRef.current = null;
    history.endTransaction();
  }, [history.endTransaction]);

  const resetNodeSize = useCallback((nodeId: string) => {
    recordHistory();
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId) return node;
        const {
          width: _width,
          height: _height,
          measured: _measured,
          resizing: _resizing,
          ...rest
        } = node;
        return {
          ...rest,
          style: node.style
            ? { ...node.style, width: undefined, height: undefined }
            : undefined,
        };
      }),
    );
  }, [recordHistory, setNodes]);

  const nudgeNode = useCallback(
    (id: string, key: string, distance: number) => {
      const direction = {
        ArrowUp: { x: 0, y: -distance },
        ArrowDown: { x: 0, y: distance },
        ArrowLeft: { x: -distance, y: 0 },
        ArrowRight: { x: distance, y: 0 },
      }[key];
      if (!direction) return;
      recordHistory();
      setNodes((current) => current.map((node) => (
        node.id === id
          ? {
              ...node,
              position: {
                x: node.position.x + direction.x,
                y: node.position.y + direction.y,
              },
            }
          : node
      )));
    },
    [recordHistory, setNodes],
  );

  const nudgeSelectedNodes = useCallback((key: string, distance: number) => {
    const direction = {
      ArrowUp: { x: 0, y: -distance },
      ArrowDown: { x: 0, y: distance },
      ArrowLeft: { x: -distance, y: 0 },
      ArrowRight: { x: distance, y: 0 },
    }[key];
    if (!direction || selectedNodeIds.length === 0) return;
    recordHistory();
    const ids = new Set(selectedNodeIds);
    setNodes((current) => current.map((node) => ids.has(node.id)
      ? {
          ...node,
          position: {
            x: node.position.x + direction.x,
            y: node.position.y + direction.y,
          },
        }
      : node));
  }, [selectedNodeIds, recordHistory, setNodes]);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | globalThis.MouseEvent) => {
      event.preventDefault();
      const pos = rf.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      insertPos.current = pos ?? { x: 160, y: 160 };
      insertSourceId.current = null;
      selection.clearCanvas();
      setPaletteOpen(false);
      setPaletteAnchor(null);
      setMenu({ x: event.clientX, y: event.clientY, kind: "pane" });
    },
    [selection.clearCanvas],
  );

  const onNodeContextMenu = useCallback(
    (event: MouseEvent, node: Node<FluxNodeData>) => {
      event.preventDefault();
      const preserveMultiSelection = selectedNodeIds.includes(node.id) && selectedNodeIds.length > 1;
      selection.selectNode(node.id, {
        mode: preserveMultiSelection ? "preserve" : "replace",
        inspector: "preserve",
      });
      setMenu({ x: event.clientX, y: event.clientY, kind: "node", nodeId: node.id });
    },
    [selectedNodeIds, selection.selectNode],
  );

  const onEdgeContextMenu = useCallback(
    (event: MouseEvent, edge: Edge) => {
      event.preventDefault();
      selection.selectEdge(edge.id);
      setPaletteOpen(false);
      setPaletteAnchor(null);
      setMenu({ x: event.clientX, y: event.clientY, kind: "edge", edgeId: edge.id });
    },
    [selection.selectEdge],
  );

  const openWorkflowRename = useCallback(() => {
    setRenameDraft(workflowTitle);
    setRenameOpen(true);
  }, [workflowTitle]);

  function commitWorkflowTitle() {
    const nextTitle = renameDraft.trim() || "未命名工作流";
    setRenameDraft(nextTitle);
    setWorkflowTitle(nextTitle);
    setRenameOpen(false);
  }

  const menuItems: ContextMenuItem[] = !menu
    ? []
    : menu.kind === "node"
      ? [
          {
            label: "高级设置",
            onClick: () => menu.nodeId && openNodeInspector(menu.nodeId),
          },
          {
            label: "追加下游节点",
            onClick: () => menu.nodeId && openNodePaletteForAppend(menu.nodeId),
          },
          {
            label: "复制节点",
            onClick: () => menu.nodeId && duplicateNode(menu.nodeId),
          },
          {
            label: "恢复默认尺寸",
            onClick: () => menu.nodeId && resetNodeSize(menu.nodeId),
          },
          {
            label: "删除节点",
            danger: true,
            onClick: () => menu.nodeId && deleteNode(menu.nodeId),
          },
        ]
      : menu.kind === "edge"
        ? [
            {
              label: "删除连线",
              danger: true,
              onClick: () => menu.edgeId && deleteEdge(menu.edgeId),
            },
          ]
      : [
          {
            label: "添加节点",
            onClick: () => openNodePaletteAtScreenPoint({ x: menu.x, y: menu.y }),
          },
          { label: "重命名工作流", onClick: () => openWorkflowRename() },
          { label: "适应视图", onClick: () => rf.current?.fitView({ duration: 200 }) },
          { label: "返回工作台", onClick: () => setMode("workbench") },
        ];

  const stepByNodeId = useMemo(() => {
    const order = compileCanvasExecutionOrder(nodes, edges);
    return new Map(order.map((id, index) => [id, index + 1]));
  }, [nodes, edges]);

  const deliveryNodeIds = useMemo(() => {
    const sources = new Set(edges.map((edge) => edge.source));
    return new Set(nodes.filter((node) => !sources.has(node.id)).map((node) => node.id));
  }, [nodes, edges]);

  const edgesForRender = useMemo<Edge[]>(() => {
    const statusByNodeId = new Map<string, string>();
    for (const run of testRunDisplay?.runs ?? []) {
      statusByNodeId.set(run.nodeId, run.status);
    }

    const rendered: Edge[] = edges.map((edge): Edge => {
      const sourceStep = stepByNodeId.get(edge.source);
      const targetStep = stepByNodeId.get(edge.target);
      const sourceStatus = statusByNodeId.get(edge.source);
      const targetStatus = statusByNodeId.get(edge.target);
      const targetNode = nodes.find((node) => node.id === edge.target);
      const targetIsErrorHandler = targetNode
        ? registry.resolve(targetNode.data.fluxType)?.executionRole === "error-handler"
        : false;
      const isErrorPath = edge.data?.route === "error" || targetIsErrorHandler;
      const isSelected = edge.id === selectedEdgeId;
      const connectionDraft =
        connectionController.session.mode === "reconnecting" &&
        connectionController.session.edgeId === edge.id
          ? connectionController.draft ?? undefined
          : undefined;
      const runningPath =
        targetStatus === NODE_RUN_STATUS.RUNNING ||
        ((isErrorPath ? sourceStatus === NODE_RUN_STATUS.FAILED : sourceStatus === NODE_RUN_STATUS.SUCCESS) &&
          targetStatus === NODE_RUN_STATUS.PENDING);
      const completedPath =
        (isErrorPath ? sourceStatus === NODE_RUN_STATUS.FAILED : sourceStatus === NODE_RUN_STATUS.SUCCESS) &&
        (targetStatus === NODE_RUN_STATUS.SUCCESS ||
          targetStatus === NODE_RUN_STATUS.RUNNING);
      const stroke = runningPath
        ? isErrorPath ? "var(--danger)" : "var(--accent)"
        : completedPath
          ? isErrorPath ? "var(--danger)" : "var(--success)"
          : isErrorPath ? "color-mix(in srgb, var(--danger) 60%, var(--border-strong))" : "var(--border-strong)";

      return {
        ...edge,
        type: "flux",
        data: {
          ...(edge.data ?? {}),
          connectionDraft,
        },
        selected: isSelected,
        reconnectable: false,
        className: isErrorPath ? "canvas-edge canvas-edge-error" : "canvas-edge",
        interactionWidth: 20,
        zIndex: isSelected ? 10 : edge.zIndex,
        animated: runningPath,
        label:
          typeof sourceStep === "number" && typeof targetStep === "number"
            ? isErrorPath ? `${sourceStep} 异常 → ${targetStep}` : `${sourceStep} → ${targetStep}`
            : edge.label,
        labelShowBg: true,
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
        labelBgStyle: {
          fill: "var(--bg-surface)",
          fillOpacity: 0.96,
          stroke: "var(--border-subtle)",
          strokeWidth: 1,
        },
        labelStyle: {
          fill: isSelected
            ? isErrorPath ? "var(--danger)" : "var(--accent)"
            : isErrorPath ? "var(--danger)" : "var(--text-muted)",
          fontSize: 10,
          fontWeight: 650,
          letterSpacing: 0,
        },
        style: {
          ...(edge.style ?? {}),
          stroke: isSelected ? isErrorPath ? "var(--danger)" : "var(--accent)" : stroke,
          strokeWidth: isSelected ? 2.25 : runningPath ? 2.2 : completedPath ? 1.8 : 1.35,
          strokeLinecap: "round" as const,
          filter: runningPath
            ? `drop-shadow(0 0 2px ${isErrorPath ? "var(--danger)" : "var(--accent)"})`
            : edge.style?.filter,
        },
      };
    });
    return rendered;
  }, [
    edges,
    nodes,
    stepByNodeId,
    testRunDisplay,
    selectedEdgeId,
    connectionController.session,
    connectionController.draft,
  ]);

  useEffect(() => {
    if (!active) return;

    function onCanvasKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;

      if (matchesShortcut(event, "close-layer")) {
        event.preventDefault();
        if (renameOpen) {
          setRenameOpen(false);
          return;
        }
        if (paletteOpen) {
          setPaletteOpen(false);
          setPaletteAnchor(null);
          return;
        }
        if (menu) {
          setMenu(null);
          return;
        }
        if (inspectingId) {
          selection.closeInspector();
          return;
        }
        selectedEdgeDragRef.current = null;
        selection.clearCanvas();
        return;
      }

      if (
        isEditableShortcutTarget(event.target) ||
        isEditableShortcutTarget(document.activeElement)
      ) return;

      if (matchesShortcut(event, "add-node")) {
        event.preventDefault();
        if (selectedId) {
          openNodePaletteForAppend(selectedId);
          return;
        }
        openNodePaletteAtScreenPoint({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        });
        return;
      }

      if (matchesShortcut(event, "save-workflow")) {
        event.preventDefault();
        void saveNow();
        return;
      }

      if (matchesShortcut(event, "run-preview")) {
        event.preventDefault();
        const store = useCanvasStore.getState();
        if (!store.testing && !store.publishing && store.status !== "saving") {
          void workflowCommands.testRun();
        }
        return;
      }

      if (matchesShortcut(event, "fit-view")) {
        event.preventDefault();
        void rf.current?.fitView({ duration: 200, padding: 0.32, maxZoom: 1 });
        return;
      }

      if (matchesShortcut(event, "redo")) {
        event.preventDefault();
        redoGraph();
        return;
      }

      if (matchesShortcut(event, "undo")) {
        event.preventDefault();
        undoGraph();
        return;
      }

      if (selectedEdgeId && matchesShortcut(event, "delete-node")) {
        event.preventDefault();
        deleteEdge(selectedEdgeId);
        return;
      }

      if (selectedNodeIds.length > 0 && matchesShortcut(event, "delete-node")) {
        event.preventDefault();
        deleteSelectedNodes();
        return;
      }

      if (selectedNodeIds.length > 1 && matchesShortcut(event, "duplicate-node")) {
        event.preventDefault();
        duplicateSelectedNodes();
        return;
      }

      if (selectedNodeIds.length > 1 && matchesShortcut(event, "nudge-node-fast")) {
        event.preventDefault();
        nudgeSelectedNodes(event.key, 24);
        return;
      }

      if (selectedNodeIds.length > 1 && matchesShortcut(event, "nudge-node")) {
        event.preventDefault();
        nudgeSelectedNodes(event.key, 8);
        return;
      }

      if (!selectedId) return;

      if (matchesShortcut(event, "inspect-node")) {
        event.preventDefault();
        openNodeInspector(selectedId);
        return;
      }

      if (matchesShortcut(event, "delete-node")) {
        event.preventDefault();
        deleteNode(selectedId);
        return;
      }

      if (matchesShortcut(event, "duplicate-node")) {
        event.preventDefault();
        duplicateNode(selectedId);
        return;
      }

      if (matchesShortcut(event, "nudge-node-fast")) {
        event.preventDefault();
        nudgeNode(selectedId, event.key, 24);
        return;
      }

      if (matchesShortcut(event, "nudge-node")) {
        event.preventDefault();
        nudgeNode(selectedId, event.key, 8);
      }
    }

    window.addEventListener("keydown", onCanvasKeyDown);
    return () => window.removeEventListener("keydown", onCanvasKeyDown);
  }, [
    active,
    selectedId,
    selectedNodeIds,
    selectedEdgeId,
    deleteNode,
    deleteEdge,
    duplicateNode,
    deleteSelectedNodes,
    duplicateSelectedNodes,
    openNodeInspector,
    openNodePaletteAtScreenPoint,
    openNodePaletteForAppend,
    undoGraph,
    redoGraph,
    nudgeNode,
    nudgeSelectedNodes,
    nodes,
    edges,
    workflowTitle,
    groups,
    saveNow,
    workflowCommands,
    renameOpen,
    paletteOpen,
    menu,
    inspectingId,
    selection.closeInspector,
    selection.clearCanvas,
  ]);

  const updateNodeData = useCallback(
    (id: string, patch: Partial<FluxNodeData>) => {
      recordHistory();
      clearStaleRunState();
      setNodes((ns) =>
        ns.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...patch } } : n,
        ),
      );
    },
    [recordHistory, clearStaleRunState, setNodes],
  );

  const onPublish = useCallback(async () => {
    setError(null);
    const store = useCanvasStore.getState();
    store.setPublishing(true);
    try {
      const record = await publishSession();
      if (!record) {
        throw new Error(useCanvasStore.getState().error ?? "发布失败");
      }
    } catch (err) {
      setError(formatProductErrorMessage(err, "发布失败"));
    } finally {
      useCanvasStore.getState().setPublishing(false);
    }
  }, [publishSession]);

  const onShare = useCallback(async () => {
    setError(null);
    const store = useCanvasStore.getState();
    store.setSharing(true);
    try {
      const record = await saveNow();
      if (!record) throw new Error("请先保存工作流");
      setShareOpen(true);
    } catch (err) {
      setError(formatProductErrorMessage(err, "准备分享失败"));
    } finally {
      useCanvasStore.getState().setSharing(false);
    }
  }, [saveNow]);

  const executeDraftRun = useCallback(async (
    inputs: ExecutionNodeInputs = {},
  ) => {
    const playbackToken = ++playbackTokenRef.current;
    let observedActiveNode = false;
    setError(null);
    setTestRunDetail(null);
    setTestRunResult(null);
    setTestRunError(null);
    clearNodeRunState();
    initializeNodeRunState();
    useCanvasStore.getState().setTesting(true);
    try {
      const saved = await saveNow();
      if (!saved) {
        throw new Error(useCanvasStore.getState().error ?? "请先保存工作流");
      }
      const id = useCanvasStore.getState().workflowId;
      if (!id) throw new Error("请先保存工作流");
      const result = await runDraftExecution(id, inputs, (detail) => {
        const hasActiveNode = detail.runs.some(
          (run) => run.status === NODE_RUN_STATUS.RUNNING,
        );
        observedActiveNode ||= hasActiveNode;
        if (detail.status === EXECUTION_STATUS.RUNNING || hasActiveNode) {
          applyNodeRunState(detail.runs);
          setTestRunDetail(detail);
        }
      });
      if (!observedActiveNode && result.runs.length > 0) {
        await playExecutionResult(result, playbackToken);
      } else {
        applyNodeRunState(result.runs);
        setTestRunResult(result);
        setTestRunDetail(null);
      }
    } catch (err) {
      clearNodeRunState();
      setTestRunError(formatProductErrorMessage(err, "执行工作流失败"));
    } finally {
      useCanvasStore.getState().setTesting(false);
    }
  }, [
    saveNow,
    clearNodeRunState,
    initializeNodeRunState,
    applyNodeRunState,
    playExecutionResult,
  ]);

  const updateRuntimeInput = useCallback((
    nodeId: string,
    value: Record<string, unknown>,
  ) => {
    playbackTokenRef.current += 1;
    clearNodeRunState();
    setTestRunDetail(null);
    setTestRunResult(null);
    setTestRunError(null);
    setRuntimeInputError(null);
    runtimeInputDraftsRef.current = {
      ...runtimeInputDraftsRef.current,
      [nodeId]: value,
    };
  }, [clearNodeRunState]);

  const onTestRun = useCallback(async () => {
    const inputNodes = nodes.filter((node) =>
      Boolean(registry.resolve(node.data.fluxType)?.runtimeInputSchema),
    );
    const inputs: ExecutionNodeInputs = {};
    for (const node of inputNodes) {
      const schema = registry.resolve(node.data.fluxType)?.runtimeInputSchema;
      inputs[node.id] = runtimeInputDraftsRef.current[node.id] ?? defaultsFromSchema(schema);
    }

    const missingNode = inputNodes.find((node) =>
      missingRuntimeInputFields(
        node,
        inputs[node.id] ?? {},
        edges.some((edge) => edge.target === node.id),
      ).length > 0,
    );
    if (missingNode) {
      setRuntimeInputError("请完成本次运行所需的输入");
      selection.selectNode(missingNode.id);
      return;
    }

    setRuntimeInputError(null);
    await executeDraftRun(inputs);
  }, [nodes, edges, executeDraftRun, selection.selectNode]);

  const addNodeFromCommand = useCallback(() => {
    openNodePaletteAtScreenPoint({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    });
  }, [openNodePaletteAtScreenPoint]);

  const insertNodeFromCommand = useCallback((nodeType: string) => {
    const position = rf.current?.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    }) ?? { x: 160, y: 160 };
    insertPos.current = position;
    insertSourceId.current = null;
    setPaletteOpen(false);
    setPaletteAnchor(null);
    setMenu(null);
    insertNode(nodeType, position);
  }, [insertNode]);

  useRegisterWorkflowCommands({
    save: async () => {
      await saveNow();
    },
    publish: onPublish,
    share: onShare,
    testRun: onTestRun,
    openWorkflow,
    createDraft,
    addNode: addNodeFromCommand,
    insertNodeType: insertNodeFromCommand,
    renameWorkflow: openWorkflowRename,
  });

  const approvePausedRun = useCallback(
    async (decision: "approved" | "rejected") => {
      const display = testRunDetail ?? testRunResult;
      const executionId = getExecutionDisplayId(display);
      const approvalRun = display?.runs.find(
        (run) =>
          run.status === NODE_RUN_STATUS.RUNNING &&
          run.type === "flux.business.humanReview",
      );
      if (!executionId || !approvalRun) return;

      setError(null);
      setTestRunError(null);
      useCanvasStore.getState().setTesting(true);
      try {
        const result = await approveExecutionAndContinue(
          executionId,
          {
            nodeId: approvalRun.nodeId,
            decision,
          },
          (detail) => {
            applyNodeRunState(detail.runs);
            setTestRunDetail(detail);
          },
        );
        applyNodeRunState(result.runs);
        setTestRunResult(result);
        setTestRunDetail(null);
      } catch (err) {
        setTestRunError(formatProductErrorMessage(err, "人工确认失败"));
      } finally {
        useCanvasStore.getState().setTesting(false);
      }
    },
    [applyNodeRunState, testRunDetail, testRunResult],
  );

  const canvasRunProgress = useMemo(() => {
    const total = testRunDisplay?.order.length || nodes.length;
    const runs = testRunDisplay?.runs ?? [];
    const completed = runs.filter((run) => TERMINAL_NODE_RUN_STATUS.has(run.status)).length;
    const activeRun =
      runs.find((run) => run.status === "running") ??
      (runs.length > 0 ? runs[runs.length - 1] : undefined);
    const status = testRunDisplay?.status ?? EXECUTION_STATUS.RUNNING;
    const approvalRun =
      status === EXECUTION_STATUS.PAUSED
        ? runs.find(
            (run) =>
              run.status === NODE_RUN_STATUS.RUNNING &&
              run.type === "flux.business.humanReview",
          )
        : undefined;

    if (testRunError) {
      return {
        status: EXECUTION_STATUS.FAILED,
        completed,
        total,
        activeLabel: formatExecutionMessage(testRunError),
      };
    }

    if (!testing && !testRunDisplay) return null;

    return {
      status,
      completed: Math.min(completed, total),
      total,
      activeLabel: approvalRun
        ? "等待人工确认"
        : activeRun
          ? getNodeTypeName(activeRun.type)
          : "准备运行",
      approvalNodeId: approvalRun?.nodeId,
    };
  }, [nodes.length, testRunDisplay, testRunError, testing]);

  useEffect(() => {
    useCanvasStore.getState().setRunProgress(
      canvasRunProgress
        ? {
            status: canvasRunProgress.status,
            completed: canvasRunProgress.completed,
            total: canvasRunProgress.total,
            activeLabel: canvasRunProgress.activeLabel,
          }
        : null,
    );
  }, [canvasRunProgress]);

  useEffect(
    () => () => useCanvasStore.getState().setRunProgress(null),
    [],
  );

  const selectedNodeIdSet = useMemo(
    () => new Set(selectedNodeIds),
    [selectedNodeIds],
  );
  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIdSet.has(node.id)),
    [nodes, selectedNodeIdSet],
  );
  const selectionBounds = useMemo(
    () => selectedNodes.length > 1 ? getNodesBounds(selectedNodes) : null,
    [selectedNodes],
  );
  const groupLayouts = useMemo<CanvasGroupLayout[]>(() => groups.flatMap((group) => {
    const groupNodeIds = new Set(group.nodeIds);
    const members = nodes.filter((node) => groupNodeIds.has(node.id));
    return members.length >= 2
      ? [{ group, bounds: getNodesBounds(members) }]
      : [];
  }), [groups, nodes]);
  const selectedEdgeForRender = useMemo(
    () => edges.find((edge) => edge.id === selectedEdgeId),
    [edges, selectedEdgeId],
  );

  const nodesForRender = useMemo<Node<FluxNodeData>[]>(
    () =>
      nodes.map((node): Node<FluxNodeData> => {
        const definition = registry.resolve(node.data.fluxType);
        const runtimeSchema = definition?.runtimeInputSchema;
        const awaitingApproval =
          node.data.fluxType === "flux.business.humanReview" &&
          canvasRunProgress?.approvalNodeId === node.id;
        const movingSource =
          connectionController.session.mode === "reconnecting" &&
          connectionController.session.edgeId === selectedEdgeForRender?.id &&
          connectionController.session.endpoint === "source";
        const movingTarget =
          connectionController.session.mode === "reconnecting" &&
          connectionController.session.edgeId === selectedEdgeForRender?.id &&
          connectionController.session.endpoint === "target";
        const selectedConnectionHandleIds = [
          selectedEdgeForRender?.source === node.id && !movingSource
            ? selectedEdgeForRender.sourceHandle
            : null,
          selectedEdgeForRender?.target === node.id && !movingTarget
            ? selectedEdgeForRender.targetHandle
            : null,
        ].filter((handleId): handleId is string => typeof handleId === "string");
        const candidateConnectionHandleIds =
          (connectionController.session.mode === "creating" ||
            connectionController.session.mode === "reconnecting") &&
          connectionController.session.candidate?.connection &&
          connectionController.session.candidate.port.nodeId === node.id
            ? [connectionController.session.candidate.port.handleId]
            : [];
        const invalidConnectionHandleIds =
          (connectionController.session.mode === "creating" ||
            connectionController.session.mode === "reconnecting") &&
          connectionController.session.candidate?.reason &&
          connectionController.session.candidate.port.nodeId === node.id
            ? [connectionController.session.candidate.port.handleId]
            : [];

        return {
          ...node,
          selected: selectedNodeIdSet.has(node.id),
          data: {
            ...node.data,
            hasCustomSize: typeof node.width === "number" && typeof node.height === "number",
            multiSelected: selectedNodeIds.length > 1 && selectedNodeIdSet.has(node.id),
            allowHoverToolbar:
              (selectedNodeIds.length === 0 && selectedEdgeId === null) ||
              (selectedNodeIds.length === 1 && selectedNodeIdSet.has(node.id)),
            selectedConnectionHandleIds,
            candidateConnectionHandleIds,
            invalidConnectionHandleIds,
            executionStep: stepByNodeId.get(node.id),
            showRunOutput: deliveryNodeIds.has(node.id),
            isErrorHandler: definition?.executionRole === "error-handler",
            presentation: definition
              ? buildNodeBusinessPresentation(definition, deliveryNodeIds.has(node.id))
              : undefined,
            runtimeInput: runtimeSchema
              ? {
                  schema: toFormSchema(runtimeSchema),
                  draftKey: `${runtimeInputRevision}:${node.id}`,
                  initialValue: runtimeInputDraftsRef.current[node.id] ?? defaultsFromSchema(runtimeSchema),
                  error: node.id === selectedId ? runtimeInputError : null,
                  disabled: testing,
                  upstreamConnected: edges.some((edge) => edge.target === node.id),
                  onChange: (value: FormValue) => updateRuntimeInput(node.id, value),
                }
              : undefined,
            approval: node.data.fluxType === "flux.business.humanReview"
              ? {
                  awaiting: awaitingApproval,
                  disabled: testing,
                  onDecision: (decision: "approved" | "rejected") => {
                    if (awaitingApproval) void approvePausedRun(decision);
                  },
                }
              : undefined,
            actions: {
              append: () => openNodePaletteForAppend(node.id),
              openSettings: () => openNodeInspector(node.id),
              duplicate: () => duplicateNode(node.id),
              delete: () => deleteNode(node.id),
              beginResize: recordHistory,
              resetSize: () => resetNodeSize(node.id),
              updateConfig: (key: string, value: unknown) => {
                updateNodeData(node.id, {
                  config: { ...node.data.config, [key]: value },
                });
              },
              beginConnection: (handleId, pointer) => {
                connectionController.beginFromPort(node.id, handleId, pointer);
              },
            },
          },
        };
      }),
    [
      nodes,
      edges,
      canvasRunProgress,
      selectedId,
      selectedNodeIds,
      selectedNodeIdSet,
      selectedEdgeId,
      selectedEdgeForRender,
      connectionController.session,
      connectionController.beginFromPort,
      runtimeInputError,
      runtimeInputRevision,
      testing,
      stepByNodeId,
      deliveryNodeIds,
      updateRuntimeInput,
      approvePausedRun,
      openNodePaletteForAppend,
      openNodeInspector,
      duplicateNode,
      deleteNode,
      resetNodeSize,
      updateNodeData,
    ],
  );

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex" }}>
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div
          style={{ position: "absolute", inset: 0 }}
          onDoubleClick={onPaneDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ReactFlow
            className={
              connectionController.session.mode === "creating" ||
              connectionController.session.mode === "reconnecting"
                ? "canvas-flow is-connecting"
                : "canvas-flow"
            }
            nodes={nodesForRender}
            edges={edgesForRender}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => (rf.current = instance)}
            onNodesChange={onCanvasNodesChange}
            onEdgesChange={onCanvasEdgesChange}
            onSelectionChange={onCanvasSelectionChange}
            nodesConnectable={false}
            edgesReconnectable={false}
            deleteKeyCode={null}
            selectionOnDrag
            selectionMode={SelectionMode.Partial}
            panOnDrag={[1, 2]}
            multiSelectionKeyCode={["Control", "Meta", "Shift"]}
            onNodeDragStart={history.beginTransaction}
            onNodeDragStop={history.endTransaction}
            onNodeClick={(event, node) => {
              const endpointDropEdgeId = selectedEdgeDragRef.current?.id ?? null;
              if (
                endpointDropEdgeId &&
                Date.now() < suppressNodeSelectionUntilRef.current
              ) {
                selection.selectEdge(endpointDropEdgeId, "preserve");
                return;
              }
              selectedEdgeDragRef.current = null;
              suppressNodeSelectionUntilRef.current = 0;
              if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                selection.selectNode(node.id);
              } else {
                selection.prepareNodeToggle();
              }
              setPaletteOpen(false);
              setPaletteAnchor(null);
              setMenu(null);
            }}
            onNodeDoubleClick={(_, node) => {
              const endpointDropEdgeId = selectedEdgeDragRef.current?.id ?? null;
              if (
                endpointDropEdgeId &&
                Date.now() < suppressNodeSelectionUntilRef.current
              ) {
                selection.selectEdge(endpointDropEdgeId, "preserve");
                return;
              }
              selectedEdgeDragRef.current = null;
              suppressNodeSelectionUntilRef.current = 0;
              selection.selectNode(node.id, { inspector: "open" });
            }}
            onEdgeClick={(_, edge) => {
              selectedEdgeDragRef.current = edge;
              selection.selectEdge(edge.id);
              setPaletteOpen(false);
              setPaletteAnchor(null);
              setMenu(null);
            }}
            onPaneClick={() => {
              selectedEdgeDragRef.current = null;
              selection.clearCanvas();
              setMenu(null);
            }}
            onPaneContextMenu={onPaneContextMenu}
            onNodeContextMenu={onNodeContextMenu}
            onEdgeContextMenu={onEdgeContextMenu}
            fitView
            fitViewOptions={{ padding: 0.32, maxZoom: 1 }}
            colorMode="dark"
            minZoom={0.1}
            maxZoom={4}
            noWheelClassName="nowheel"
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements={nodes.length > 120}
            proOptions={{ hideAttribution: true }}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            {connectionController.session.mode === "creating" && connectionController.draft ? (
              <ViewportPortal>
                <FluxConnectionDraftLayer draft={connectionController.draft} />
              </ViewportPortal>
            ) : null}
            <CanvasSelectionLayer
              selectedNodes={selectedNodes}
              selectionBounds={selectionBounds}
              groupLayouts={groupLayouts}
              selectedGroupId={selectedGroupId}
              onMergeSelection={mergeSelectedNodes}
              onDuplicateSelection={duplicateSelectedNodes}
              onDeleteSelection={deleteSelectedNodes}
              onSelectGroup={selectGroup}
              onUngroup={ungroupNodes}
              onGroupPointerDown={beginGroupDrag}
              onGroupPointerMove={moveGroup}
              onGroupPointerUp={endGroupDrag}
            />
          </ReactFlow>
        </div>

        {error && (
          <div role="alert" className="canvas-error-toast" style={errorStyle}>
            {error}
          </div>
        )}

        <CanvasNodePalette
          open={paletteOpen}
          anchor={paletteAnchor}
          onClose={() => {
            setPaletteOpen(false);
            setPaletteAnchor(null);
          }}
          items={paletteItems}
          onSelect={(item) => {
            insertNode(
              item.id,
              insertPos.current ?? {
                x: 120 + Math.random() * 280,
                y: 120 + Math.random() * 200,
              },
            );
            setPaletteOpen(false);
            setPaletteAnchor(null);
          }}
        />
      </div>

      {inspectingNode && (
        <NodeInspector
          node={inspectingNode}
          onClose={selection.closeInspector}
          onLabelChange={(label) => updateNodeData(inspectingNode.id, { label })}
          onConfigChange={(config: FormValue) =>
            updateNodeData(inspectingNode.id, { config })
          }
        />
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={() => setMenu(null)}
        />
      )}

      {renameOpen && (
        <Drawer
          open
          onClose={() => setRenameOpen(false)}
          title="重命名工作流"
          variant="overlay"
          width={360}
        >
          <div style={renamePanel}>
            <input
              aria-label="工作流名称"
              value={renameDraft}
              autoFocus
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitWorkflowTitle();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  setRenameOpen(false);
                }
              }}
              style={renameInput}
            />
            <div style={renameActions}>
              <button
                type="button"
                onClick={commitWorkflowTitle}
                style={renameSaveButton}
              >
                保存
              </button>
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                style={renameCancelButton}
              >
                取消
              </button>
            </div>
          </div>
        </Drawer>
      )}

      <ConflictDialog
        open={conflict !== null}
        localVersion={conflict?.localVersion ?? 0}
        remoteVersion={conflict?.remoteVersion ?? 0}
        onKeepLocal={() => void keepLocalVersion()}
        onUseRemote={useStoredVersion}
      />
      <ShareWorkflowDialog
        open={shareOpen}
        workflowId={workflowId}
        workflowTitle={workflowTitle}
        onClose={() => setShareOpen(false)}
      />
    </div>
  );
}

const errorStyle: React.CSSProperties = {
  position: "absolute",
  bottom: 64,
  right: 16,
  padding: "var(--space-2) var(--space-3)",
  background: "var(--danger-subtle)",
  color: "var(--danger)",
  border: "1px solid var(--danger)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-popover)",
  fontSize: "var(--text-sm)",
  maxWidth: "min(360px, calc(100vw - var(--space-8)))",
  wordBreak: "break-word",
  zIndex: "var(--z-toast)" as unknown as number,
};

const renamePanel: React.CSSProperties = {
  display: "grid",
  gap: "var(--space-4)",
};

const renameInput: React.CSSProperties = {
  width: "100%",
  height: 36,
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  outline: "none",
  background: "var(--bg-inset)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--text-sm)",
};

const renameActions: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "var(--space-2)",
};

const renameSaveButton: React.CSSProperties = {
  height: 30,
  padding: "0 var(--space-3)",
  border: "1px solid var(--accent)",
  borderRadius: "var(--radius-md)",
  background: "var(--accent-subtle)",
  color: "var(--accent)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontWeight: 650,
};

const renameCancelButton: React.CSSProperties = {
  height: 30,
  padding: "0 var(--space-3)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-inset)",
  color: "var(--text-muted)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  fontWeight: 650,
};
