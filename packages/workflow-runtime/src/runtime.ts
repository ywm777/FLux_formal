import {
  ERROR_OUTPUT_PORT_ID,
  type CapabilityInvocationMetadata,
  type NodeContext,
  type NodeDefinition,
  type NodeRegistry,
} from "@flux/node-sdk";
import {
  NODE_RUN_STATUS,
  type ExecutionNodeInputs,
  type NodeRunStatus,
} from "@flux/shared";
import type { CanvasEdge, WorkflowGraph } from "@flux/workflow-schema";

export interface ExecutionLogEntry {
  nodeId: string;
  level: "info" | "warn" | "error";
  message: string;
  at: string;
}

export interface NodeRunResult {
  nodeId: string;
  type: string;
  status: NodeRunStatus;
  outputs?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionResult {
  status: "success" | "failed" | "cancelled" | "paused";
  order: string[];
  runs: NodeRunResult[];
  logs: ExecutionLogEntry[];
  pausedNodeId?: string;
  checkpoint: ExecutionCheckpoint;
}

export interface ExecutionCheckpointPort {
  key: string;
  value?: unknown;
}

/**
 * A graph-version-specific resume point. Completed runs are not invoked again;
 * produced ports retain the values needed by downstream nodes.
 */
export interface ExecutionCheckpoint {
  graphId: string;
  graphVersion: number;
  completedRuns: NodeRunResult[];
  producedPorts: ExecutionCheckpointPort[];
  /** The manual approval node that stopped the previous invocation. */
  pausedNodeId?: string;
}

export interface RunCallbacks {
  signal?: AbortSignal;
  invoke?: NodeContext["invoke"];
  executionId?: string;
  effectJournal?: ExecutionEffectJournal;
  resumeFrom?: ExecutionCheckpoint;
  onLog?: (entry: ExecutionLogEntry) => void;
  onNodeRun?: (run: NodeRunResult) => void;
  onCheckpoint?: (checkpoint: ExecutionCheckpoint) => void;
}

export interface ExecutionEffectInvocation {
  id: string;
  bindingId: string;
  action: string;
  payload?: unknown;
  metadata: CapabilityInvocationMetadata;
}

export interface ExecutionEffectRecord extends Omit<ExecutionEffectInvocation, "payload"> {
  status: "pending" | "completed" | "failed";
  result?: unknown;
  error?: string;
  updatedAt: string;
}

export type EffectJournalBeginResult =
  | { kind: "execute" }
  | { kind: "replay"; result: unknown };

export interface ExecutionEffectJournal {
  begin(invocation: ExecutionEffectInvocation): Promise<EffectJournalBeginResult>;
  complete(invocation: ExecutionEffectInvocation, result: unknown): Promise<void>;
  fail(invocation: ExecutionEffectInvocation, error: string): Promise<void>;
}

export interface MissingRuntimeInput {
  nodeId: string;
  nodeType: string;
  fields: string[];
}

export class ExecutionInputRequiredError extends Error {
  readonly code = "EXECUTION_INPUT_REQUIRED";

  constructor(readonly missing: MissingRuntimeInput[]) {
    super("请先完成本次运行所需的输入");
    this.name = "ExecutionInputRequiredError";
  }
}

const DEFAULT_OUT = "out";
const DEFAULT_IN = "in";
const HUMAN_REVIEW_NODE_TYPE = "flux.business.humanReview";
export const MAX_NODE_OUTPUT_BYTES = 1024 * 1024;
export const MAX_CAPABILITY_RESULT_BYTES = 1024 * 1024;

function normalizeCapabilityResult(result: unknown): unknown {
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(result, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new TypeError("结果包含非有限数值");
      }
      if (typeof value === "bigint") {
        throw new TypeError("结果包含无法持久化的值");
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError("结果包含非 JSON 对象");
        }
      }
      return value;
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知原因";
    throw new Error(`外部能力结果无法安全持久化: ${reason}`);
  }
  if (serialized === undefined) {
    throw new Error("外部能力结果必须是 JSON 值");
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
      MAX_CAPABILITY_RESULT_BYTES
  ) {
    throw new Error(
      `外部能力结果超过 ${MAX_CAPABILITY_RESULT_BYTES} 字节上限`,
    );
  }
  return JSON.parse(serialized) as unknown;
}

function normalizeNodeOutputs(
  definition: NodeDefinition,
  outputs: Record<string, unknown>,
): Record<string, unknown> {
  if (!outputs || typeof outputs !== "object" || Array.isArray(outputs)) {
    throw new Error("节点输出必须是按端口组织的对象");
  }
  const declaredPorts = new Set(definition.ports.outputs.map((port) => port.id));
  for (const port of Object.keys(outputs)) {
    if (!declaredPorts.has(port)) {
      throw new Error(`节点返回了未声明的输出端口: ${port}`);
    }
  }

  let serialized: string;
  try {
    serialized = JSON.stringify(outputs, (_key, value: unknown) => {
      if (typeof value === "number" && !Number.isFinite(value)) {
        throw new TypeError("输出包含非有限数值");
      }
      if (typeof value === "bigint") {
        throw new TypeError("输出包含无法持久化的值");
      }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new TypeError("输出包含非 JSON 对象");
        }
      }
      return value;
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "未知原因";
    throw new Error(`节点输出无法安全持久化: ${reason}`);
  }
  if (new TextEncoder().encode(serialized).byteLength > MAX_NODE_OUTPUT_BYTES) {
    throw new Error(`节点输出超过 ${MAX_NODE_OUTPUT_BYTES} 字节上限`);
  }
  const normalized = JSON.parse(serialized) as Record<string, unknown>;
  for (const port of Object.keys(outputs)) {
    if (!Object.prototype.hasOwnProperty.call(normalized, port)) {
      throw new Error(`节点输出端口 ${port} 包含无法持久化的值`);
    }
  }
  return normalized;
}

function getRetryTimes(data: Record<string, unknown>): number {
  const raw = data.retryTimes;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(5, Math.trunc(raw)));
}

function isManualApprovalNode(node: {
  type: string;
  data: Record<string, unknown>;
}): boolean {
  return node.type === HUMAN_REVIEW_NODE_TYPE &&
    String(node.data.decision ?? "manual") === "manual";
}

function isControlPause(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason === "pause";
}

async function stableIdempotencyKey(material: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `flux_${hex}`;
}

export function compileExecutionOrder(graph: WorkflowGraph): string[] {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    indegree.set(node.id, 0);
    adjacency.set(node.id, []);
  }
  for (const edge of graph.edges) {
    if (!indegree.has(edge.target) || !adjacency.has(edge.source)) continue;
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
    adjacency.get(edge.source)?.push(edge.target);
  }

  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  const order: string[] = [];
  let queueIndex = 0;
  while (queueIndex < queue.length) {
    const id = queue[queueIndex];
    queueIndex += 1;
    if (!id) continue;
    order.push(id);
    for (const next of adjacency.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }

  if (order.length !== graph.nodes.length) {
    throw new Error("工作流存在环，无法编译为 DAG");
  }
  return order;
}

export function prepareWorkflowForExecution(
  graph: WorkflowGraph,
  registry: NodeRegistry,
  inputs: ExecutionNodeInputs = {},
): WorkflowGraph {
  const executionGraph = structuredClone(graph);
  const missing: MissingRuntimeInput[] = [];
  const nodesWithUpstream = new Set(executionGraph.edges.map((edge) => edge.target));

  for (const node of executionGraph.nodes) {
    const definition = registry.resolve(node.type);
    const schema = definition?.runtimeInputSchema;
    if (!schema) continue;
    const provided = inputs[node.id] ?? {};
    const runtimeValues: Record<string, unknown> = {};

    for (const [key, property] of Object.entries(schema.properties ?? {})) {
      if (Object.prototype.hasOwnProperty.call(provided, key)) {
        runtimeValues[key] = provided[key];
      } else if (property.default !== undefined) {
        runtimeValues[key] = property.default;
      }
    }

    const missingFields = (schema.required ?? []).filter((key) => {
      const value = runtimeValues[key];
      return value === undefined || value === null ||
        (typeof value === "string" && !value.trim());
    });
    const acceptsUpstreamFallback =
      definition?.runtimeInputPolicy === "fallback" && nodesWithUpstream.has(node.id);
    if (missingFields.length > 0 && !acceptsUpstreamFallback) {
      missing.push({ nodeId: node.id, nodeType: node.type, fields: missingFields });
      continue;
    }
    node.data = { ...node.data, ...runtimeValues };
  }

  if (missing.length > 0) throw new ExecutionInputRequiredError(missing);
  return executionGraph;
}

export async function runWorkflow(
  graph: WorkflowGraph,
  registry: NodeRegistry,
  options: RunCallbacks = {},
): Promise<ExecutionResult> {
  const order = compileExecutionOrder(graph);
  if (
    options.resumeFrom &&
    (options.resumeFrom.graphId !== graph.id ||
      options.resumeFrom.graphVersion !== graph.version)
  ) {
    throw new Error("执行 checkpoint 与工作流快照版本不匹配");
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const errorHandlerNodeIds = new Set(
    graph.nodes
      .filter((node) => registry.resolve(node.type)?.executionRole === "error-handler")
      .map((node) => node.id),
  );
  const sourceKey = (edge: CanvasEdge) => {
    const port = errorHandlerNodeIds.has(edge.target)
      ? ERROR_OUTPUT_PORT_ID
      : edge.sourcePort ?? DEFAULT_OUT;
    return `${edge.source}:${port}`;
  };
  const incomingByTarget = new Map<string, CanvasEdge[]>();
  const outgoingBySource = new Map<string, CanvasEdge[]>();
  for (const edge of graph.edges) {
    incomingByTarget.set(edge.target, [
      ...(incomingByTarget.get(edge.target) ?? []),
      edge,
    ]);
    outgoingBySource.set(edge.source, [
      ...(outgoingBySource.get(edge.source) ?? []),
      edge,
    ]);
  }

  const logs: ExecutionLogEntry[] = [];
  const resumableRuns = (options.resumeFrom?.completedRuns ?? [])
    .filter((run) => nodeById.get(run.nodeId)?.type === run.type)
    .map((run) => structuredClone(run));
  const runs: NodeRunResult[] = resumableRuns;
  const runIndexByNodeId = new Map(
    runs.map((run, index) => [run.nodeId, index]),
  );
  const completedNodeIds = new Set(resumableRuns.map((run) => run.nodeId));
  const restoredPorts = options.resumeFrom?.producedPorts ?? [];
  const producedPorts = new Set(restoredPorts.map((port) => port.key));
  const portValues = new Map(restoredPorts.map((port) => [port.key, port.value]));
  const signal = options.signal ?? new AbortController().signal;
  const executionId = options.executionId ?? crypto.randomUUID();
  const providerInvoke = options.invoke ?? (async () => {
    throw new Error("当前节点需要已授权的外部连接");
  });

  const pushLog = (entry: ExecutionLogEntry) => {
    logs.push(entry);
    options.onLog?.(entry);
  };
  const buildCheckpoint = (pausedNodeId?: string): ExecutionCheckpoint => ({
    graphId: graph.id,
    graphVersion: graph.version,
    completedRuns: runs.map((run) => structuredClone(run)),
    producedPorts: [...producedPorts].map((key) => ({
      key,
      value: structuredClone(portValues.get(key)),
    })),
    ...(pausedNodeId ? { pausedNodeId } : {}),
  });
  const publishCheckpoint = (pausedNodeId?: string) => {
    const checkpoint = buildCheckpoint(pausedNodeId);
    options.onCheckpoint?.(checkpoint);
    return checkpoint;
  };
  const pushRun = (run: NodeRunResult) => {
    const existingIndex = runIndexByNodeId.get(run.nodeId);
    if (existingIndex !== undefined) runs[existingIndex] = run;
    else {
      runIndexByNodeId.set(run.nodeId, runs.length);
      runs.push(run);
    }
    completedNodeIds.add(run.nodeId);
    options.onNodeRun?.(run);
    publishCheckpoint();
  };
  const skipRemaining = (afterIndex: number) => {
    for (const remainingId of order.slice(afterIndex + 1)) {
      pushRun({
        nodeId: remainingId,
        type: nodeById.get(remainingId)?.type ?? "?",
        status: NODE_RUN_STATUS.SKIPPED,
      });
    }
  };
  const activateErrorBranch = (
    nodeId: string,
    error: string,
    attempt: number,
  ): boolean => {
    const errorEdges = (outgoingBySource.get(nodeId) ?? [])
      .filter((edge) => errorHandlerNodeIds.has(edge.target));
    if (errorEdges.length === 0) return false;
    const node = nodeById.get(nodeId);
    if (!node) return false;
    const definition = registry.resolve(node.type);
    const storedLabel = node.data._label;
    const nodeName = typeof storedLabel === "string" && storedLabel.trim()
      ? storedLabel
      : definition?.name ?? node.type;
    const key = `${nodeId}:${ERROR_OUTPUT_PORT_ID}`;
    producedPorts.add(key);
    portValues.set(key, {
      message: error,
      nodeId,
      nodeType: node.type,
      nodeName,
      at: new Date().toISOString(),
      attempt,
    });
    pushLog({
      nodeId,
      level: "warn",
      message: `异常已交给捕获节点处理：${error}`,
      at: new Date().toISOString(),
    });
    return true;
  };

  let aborted = false;
  for (const [orderIndex, nodeId] of order.entries()) {
    if (completedNodeIds.has(nodeId)) continue;
    if (signal.aborted) {
      if (isControlPause(signal)) {
        const checkpoint = publishCheckpoint();
        return { status: "paused", order, runs, logs, checkpoint };
      }
      aborted = true;
      pushRun({
        nodeId,
        type: nodeById.get(nodeId)?.type ?? "?",
        status: NODE_RUN_STATUS.SKIPPED,
      });
      continue;
    }
    const node = nodeById.get(nodeId);
    if (!node) continue;
    const definition: NodeDefinition | undefined = registry.resolve(node.type);
    const incoming = incomingByTarget.get(nodeId) ?? [];
    const activeEdges = incoming.filter((edge) => producedPorts.has(sourceKey(edge)));
    const isSource = incoming.length === 0;
    if (!isSource && activeEdges.length === 0) {
      pushRun({ nodeId, type: node.type, status: NODE_RUN_STATUS.SKIPPED });
      continue;
    }

    const inputsByPort: Record<string, unknown> = {};
    for (const edge of activeEdges) {
      const targetPort = edge.targetPort ?? DEFAULT_IN;
      const value = portValues.get(sourceKey(edge));
      const currentPort = definition?.ports.inputs.find((port) => port.id === targetPort);
      const savedPort = node.ports.inputs.find((port) => port.id === targetPort);
      const acceptsMany = (currentPort?.capacity ?? savedPort?.capacity) === "many";
      if (acceptsMany) {
        const collected = inputsByPort[targetPort];
        inputsByPort[targetPort] = Array.isArray(collected)
          ? [...collected, value]
          : [value];
      } else {
        inputsByPort[targetPort] = value;
      }
    }
    const defaultPort = definition?.ports.inputs.find((port) => port.id === DEFAULT_IN)
      ?? node.ports.inputs.find((port) => port.id === DEFAULT_IN);
    const nodeInputs = Object.keys(inputsByPort).length === 1 &&
      DEFAULT_IN in inputsByPort &&
      defaultPort?.capacity !== "many"
      ? (inputsByPort[DEFAULT_IN] as Record<string, unknown>) ?? {}
      : inputsByPort;
    if (!definition) {
      const error = `未注册的节点类型: ${node.type}`;
      pushLog({ nodeId, level: "error", message: error, at: new Date().toISOString() });
      pushRun({ nodeId, type: node.type, status: NODE_RUN_STATUS.FAILED, error });
      if (activateErrorBranch(nodeId, error, 1)) continue;
      skipRemaining(orderIndex);
      return { status: "failed", order, runs, logs, checkpoint: buildCheckpoint() };
    }

    let currentAttempt = 1;
    let invocationIndex = 0;
    const context: NodeContext = {
      nodeId,
      config: node.data,
      inputs: nodeInputs,
      signal,
      invoke: async (bindingId, action, payload) => {
        const currentInvocationIndex = invocationIndex;
        invocationIndex += 1;
        const idempotencyKey = await stableIdempotencyKey(
          `${executionId}\n${graph.id}\n${graph.version}\n${nodeId}\n${currentInvocationIndex}`,
        );
        const metadata: CapabilityInvocationMetadata = {
          executionId,
          nodeId,
          attempt: currentAttempt,
          invocationIndex: currentInvocationIndex,
          idempotencyKey,
        };
        const invocation: ExecutionEffectInvocation = {
          id: idempotencyKey,
          bindingId,
          action,
          payload,
          metadata,
        };
        const journalState = await options.effectJournal?.begin(invocation);
        if (journalState?.kind === "replay") {
          return structuredClone(journalState.result);
        }
        try {
          const result = await providerInvoke(bindingId, action, payload, metadata);
          const persistedResult = normalizeCapabilityResult(result);
          await options.effectJournal?.complete(invocation, persistedResult);
          return persistedResult;
        } catch (error) {
          const message = error instanceof Error ? error.message : "外部能力调用失败";
          await options.effectJournal?.fail(invocation, message);
          throw error;
        }
      },
      log: (level, message) => pushLog({
        nodeId,
        level,
        message,
        at: new Date().toISOString(),
      }),
    };
    const retryTimes = getRetryTimes(node.data);
    for (let attempt = 0; attempt <= retryTimes; attempt += 1) {
      currentAttempt = attempt + 1;
      invocationIndex = 0;
      try {
        options.onNodeRun?.({
          nodeId,
          type: node.type,
          status: NODE_RUN_STATUS.RUNNING,
        });
        if (isManualApprovalNode(node)) {
          const reviewer = String(node.data.reviewer ?? "负责人");
          pushLog({
            nodeId,
            level: "info",
            message: `等待${reviewer}人工确认`,
            at: new Date().toISOString(),
          });
          const checkpoint = publishCheckpoint(nodeId);
          return {
            status: "paused",
            order,
            runs,
            logs,
            pausedNodeId: nodeId,
            checkpoint,
          };
        }

        const result = await definition.execute(context);
        const outputs = normalizeNodeOutputs(definition, result.outputs);
        for (const [port, value] of Object.entries(outputs)) {
          const key = `${nodeId}:${port}`;
          producedPorts.add(key);
          portValues.set(key, value);
        }
        pushRun({
          nodeId,
          type: node.type,
          status: NODE_RUN_STATUS.SUCCESS,
          outputs,
        });
        if (signal.aborted) {
          if (isControlPause(signal)) {
            const checkpoint = publishCheckpoint();
            return { status: "paused", order, runs, logs, checkpoint };
          }
          aborted = true;
        }
        break;
      } catch (failure) {
        if (signal.aborted) {
          if (isControlPause(signal)) {
            const checkpoint = publishCheckpoint();
            return { status: "paused", order, runs, logs, checkpoint };
          }
          aborted = true;
          pushRun({ nodeId, type: node.type, status: NODE_RUN_STATUS.SKIPPED });
          break;
        }
        const error = failure instanceof Error ? failure.message : "节点执行失败";
        if (attempt < retryTimes) {
          pushLog({
            nodeId,
            level: "warn",
            message: `节点执行失败，正在重试 ${attempt + 1}/${retryTimes}：${error}`,
            at: new Date().toISOString(),
          });
          continue;
        }
        const fallbackOwner = node.data.fallbackOwner;
        if (typeof fallbackOwner === "string" && fallbackOwner.trim()) {
          pushLog({
            nodeId,
            level: "warn",
            message: `重试仍失败，已升级给 ${fallbackOwner}`,
            at: new Date().toISOString(),
          });
        }
        pushLog({ nodeId, level: "error", message: error, at: new Date().toISOString() });
        pushRun({ nodeId, type: node.type, status: NODE_RUN_STATUS.FAILED, error });
        if (activateErrorBranch(nodeId, error, attempt + 1)) break;
        skipRemaining(orderIndex);
        return { status: "failed", order, runs, logs, checkpoint: buildCheckpoint() };
      }
    }
  }

  return {
    status: aborted ? "cancelled" : "success",
    order,
    runs,
    logs,
    checkpoint: buildCheckpoint(),
  };
}
