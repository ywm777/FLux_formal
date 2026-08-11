import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  type ExecutionDetail,
  type ExecutionNodeInputs,
  type ExecutionStatus,
  type NodeRunRecord,
} from "@flux/shared";
import {
  compileExecutionOrder,
  LatestAsyncWriter,
  prepareWorkflowForExecution,
  runWorkflow,
  type ExecutionCheckpoint,
  type ExecutionEffectInvocation,
  type ExecutionEffectJournal,
  type ExecutionEffectRecord,
} from "@flux/workflow-runtime";
import { safeParseGraph, validateGraph, type WorkflowGraph } from "@flux/workflow-schema";
import { registry } from "./registry.js";
import { desktopStorage } from "./desktopStorage.js";
import { localWorkspaceRepository } from "./localWorkspaceRepository.js";
import { invokeLocalCapability } from "./capabilities/capabilityGateway.js";
import type { ExecutionResponse } from "./api.js";

const STORAGE_KEY = "local-executions";
const LOCAL_OWNER_ID = "local-user";
const MAX_STORED_EXECUTIONS = 100;

interface StoredLocalExecution {
  detail: ExecutionDetail;
  graphSnapshot?: WorkflowGraph;
  checkpoint?: ExecutionCheckpoint;
  effects?: ExecutionEffectRecord[];
  /** v1 compatibility only. */
  pausedGraph?: WorkflowGraph;
}

interface LocalExecutionSnapshot {
  schemaVersion: 3;
  executions: StoredLocalExecution[];
}

let writeQueue = Promise.resolve();
const approvalClaims = new Set<string>();

function emptySnapshot(): LocalExecutionSnapshot {
  return { schemaVersion: 3, executions: [] };
}

function checkpointFromLegacyEntry(
  entry: StoredLocalExecution,
): ExecutionCheckpoint | undefined {
  if (entry.checkpoint) return entry.checkpoint;
  if (!entry.pausedGraph || entry.detail.status !== EXECUTION_STATUS.PAUSED) {
    return undefined;
  }
  const completedRuns = entry.detail.runs.filter((run) =>
    run.status === NODE_RUN_STATUS.SUCCESS ||
    run.status === NODE_RUN_STATUS.FAILED ||
    run.status === NODE_RUN_STATUS.SKIPPED
  );
  const producedPorts = completedRuns.flatMap((run) =>
    Object.entries(run.outputs ?? {}).map(([port, value]) => ({
      key: `${run.nodeId}:${port}`,
      value,
    }))
  );
  const pausedNodeId = entry.pausedGraph.nodes.find((node) =>
    node.type === "flux.business.humanReview" &&
    !completedRuns.some((run) => run.nodeId === node.id)
  )?.id;
  return {
    graphId: entry.pausedGraph.id,
    graphVersion: entry.pausedGraph.version,
    completedRuns: structuredClone(completedRuns),
    producedPorts: structuredClone(producedPorts),
    ...(pausedNodeId ? { pausedNodeId } : {}),
  };
}

async function readSnapshot(): Promise<LocalExecutionSnapshot> {
  const raw = await desktopStorage.read(STORAGE_KEY);
  if (!raw) return emptySnapshot();
  try {
    const parsed = JSON.parse(raw) as {
      schemaVersion?: 1 | 2 | 3;
      executions?: StoredLocalExecution[];
    };
    if (
      (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) ||
      !Array.isArray(parsed.executions)
    ) {
      return emptySnapshot();
    }
    return {
      schemaVersion: 3,
      executions: parsed.executions.map((entry) => ({
        detail: entry.detail,
        graphSnapshot: entry.graphSnapshot ?? entry.pausedGraph,
        checkpoint: checkpointFromLegacyEntry(entry),
        effects: Array.isArray(entry.effects) ? entry.effects : [],
      })),
    };
  } catch {
    return emptySnapshot();
  }
}

function storeExecution(
  detail: ExecutionDetail,
  graphSnapshot?: WorkflowGraph,
  checkpoint?: ExecutionCheckpoint,
  effects: ExecutionEffectRecord[] = [],
): Promise<void> {
  const storedDetail = structuredClone(detail);
  const storedGraph = graphSnapshot ? structuredClone(graphSnapshot) : undefined;
  const storedCheckpoint = checkpoint ? structuredClone(checkpoint) : undefined;
  const storedEffects = structuredClone(effects);
  const operation = async () => {
    const snapshot = await readSnapshot();
    const next: StoredLocalExecution = {
      detail: storedDetail,
      graphSnapshot: storedGraph,
      checkpoint: storedCheckpoint,
      effects: storedEffects,
    };
    const existingIndex = snapshot.executions.findIndex(
      (entry) => entry.detail.id === detail.id,
    );
    if (existingIndex >= 0) snapshot.executions.splice(existingIndex, 1);
    snapshot.executions.unshift(next);
    snapshot.executions = snapshot.executions.slice(0, MAX_STORED_EXECUTIONS);
    await desktopStorage.write(STORAGE_KEY, JSON.stringify(snapshot));
  };
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

function toResponse(detail: ExecutionDetail): ExecutionResponse {
  return {
    executionId: detail.id,
    status: detail.status,
    order: detail.order,
    runs: detail.runs,
    logs: detail.logs,
    error: detail.error,
  };
}

function emit(
  detail: ExecutionDetail,
  onProgress?: (detail: ExecutionDetail) => void,
): void {
  onProgress?.(structuredClone(detail));
}

function upsertRun(
  detail: ExecutionDetail,
  run: NodeRunRecord,
  runIndexByNodeId: Map<string, number>,
): void {
  const index = runIndexByNodeId.get(run.nodeId);
  if (index !== undefined) {
    detail.runs[index] = structuredClone(run);
    return;
  }
  runIndexByNodeId.set(run.nodeId, detail.runs.length);
  detail.runs.push(structuredClone(run));
}

function mapRuntimeStatus(status: "success" | "failed" | "cancelled" | "paused"): ExecutionStatus {
  if (status === "success") return EXECUTION_STATUS.SUCCESS;
  if (status === "failed") return EXECUTION_STATUS.FAILED;
  if (status === "paused") return EXECUTION_STATUS.PAUSED;
  return EXECUTION_STATUS.CANCELLED;
}

function effectRecord(
  invocation: ExecutionEffectInvocation,
  status: ExecutionEffectRecord["status"],
  extra: Pick<ExecutionEffectRecord, "result" | "error"> = {},
): ExecutionEffectRecord {
  return {
    id: invocation.id,
    bindingId: invocation.bindingId,
    action: invocation.action,
    metadata: structuredClone(invocation.metadata),
    status,
    ...(extra.result !== undefined ? { result: structuredClone(extra.result) } : {}),
    ...(extra.error ? { error: extra.error } : {}),
    updatedAt: new Date().toISOString(),
  };
}

async function executeGraph(
  detail: ExecutionDetail,
  graphSnapshot: WorkflowGraph,
  executionGraph: WorkflowGraph,
  resumeFrom?: ExecutionCheckpoint,
  onProgress?: (detail: ExecutionDetail) => void,
  restoredEffects: ExecutionEffectRecord[] = [],
): Promise<ExecutionResponse> {
  detail.status = EXECUTION_STATUS.RUNNING;
  detail.finishedAt = undefined;
  detail.error = undefined;
  if (!resumeFrom) {
    detail.order = compileExecutionOrder(executionGraph);
    detail.runs = detail.order.map((nodeId) => ({
      nodeId,
      type: executionGraph.nodes.find((node) => node.id === nodeId)?.type ?? "?",
      status: NODE_RUN_STATUS.PENDING,
    }));
  }
  const runIndexByNodeId = new Map(
    detail.runs.map((run, index) => [run.nodeId, index]),
  );
  const effects = structuredClone(restoredEffects);
  const effectIndexById = new Map(
    effects.map((effect, index) => [effect.id, index]),
  );
  const upsertEffect = (effect: ExecutionEffectRecord) => {
    const index = effectIndexById.get(effect.id);
    if (index === undefined) {
      effectIndexById.set(effect.id, effects.length);
      effects.push(effect);
    } else {
      effects[index] = effect;
    }
  };
  let checkpoint = resumeFrom;
  const persistEffects = () =>
    storeExecution(detail, graphSnapshot, checkpoint, effects);
  const effectJournal: ExecutionEffectJournal = {
    async begin(invocation) {
      const existing = effects[effectIndexById.get(invocation.id) ?? -1];
      if (existing?.status === "completed") {
        return { kind: "replay", result: structuredClone(existing.result) };
      }
      upsertEffect(effectRecord(invocation, "pending"));
      await persistEffects();
      return { kind: "execute" };
    },
    async complete(invocation, result) {
      upsertEffect(effectRecord(invocation, "completed", { result }));
      await persistEffects();
    },
    async fail(invocation, error) {
      upsertEffect(effectRecord(invocation, "failed", { error }));
      await persistEffects();
    },
  };
  emit(detail, onProgress);
  await storeExecution(detail, graphSnapshot, resumeFrom, effects);

  const checkpointWriter = new LatestAsyncWriter<ExecutionCheckpoint>(
    (nextCheckpoint) => storeExecution(detail, graphSnapshot, nextCheckpoint, effects),
  );
  const result = await runWorkflow(executionGraph, registry, {
    invoke: invokeLocalCapability,
    executionId: detail.id,
    effectJournal,
    resumeFrom,
    onLog(entry) {
      detail.logs.push(structuredClone(entry));
      emit(detail, onProgress);
    },
    onNodeRun(run) {
      upsertRun(detail, run, runIndexByNodeId);
      emit(detail, onProgress);
    },
    onCheckpoint(nextCheckpoint) {
      checkpoint = nextCheckpoint;
      if (nextCheckpoint.pausedNodeId) {
        detail.status = EXECUTION_STATUS.PAUSED;
      }
      checkpointWriter.push(nextCheckpoint);
    },
  });
  checkpoint = result.checkpoint;

  detail.status = mapRuntimeStatus(result.status);
  const failed = detail.runs.find((run) => run.status === NODE_RUN_STATUS.FAILED);
  detail.error = failed?.error;
  if (detail.status !== EXECUTION_STATUS.PAUSED) {
    detail.finishedAt = new Date().toISOString();
  }
  emit(detail, onProgress);
  checkpointWriter.push(checkpoint);
  await checkpointWriter.flush();
  return toResponse(detail);
}

export async function runLocalDraftExecution(
  workflowId: string,
  inputs: ExecutionNodeInputs = {},
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  const workflow = await localWorkspaceRepository.get(workflowId);
  const parsed = safeParseGraph(workflow.graph);
  if (!parsed.success) throw new Error("工作流图格式无效");
  const issues = validateGraph(parsed.data).filter((issue) => issue.level === "error");
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join("；"));
  }
  const graph = prepareWorkflowForExecution(parsed.data, registry, inputs);
  const now = new Date().toISOString();
  const detail: ExecutionDetail = {
    id: `local_exec_${crypto.randomUUID()}`,
    workflowId,
    ownerId: LOCAL_OWNER_ID,
    status: EXECUTION_STATUS.RUNNING,
    startedAt: now,
    order: [],
    runs: [],
    logs: [],
  };
  return executeGraph(detail, graph, graph, undefined, onProgress);
}

export async function approveLocalExecutionAndContinue(
  executionId: string,
  input: {
    nodeId: string;
    decision: "approved" | "rejected";
    reviewer?: string;
    note?: string;
  },
  onProgress?: (detail: ExecutionDetail) => void,
): Promise<ExecutionResponse> {
  if (approvalClaims.has(executionId)) {
    throw new Error("该人工确认正在处理，请勿重复提交");
  }
  approvalClaims.add(executionId);
  try {
    const snapshot = await readSnapshot();
    const stored = snapshot.executions.find((entry) => entry.detail.id === executionId);
    if (!stored?.graphSnapshot || !stored.checkpoint) {
      throw new Error("未找到可恢复的本地运行快照");
    }
    if (stored.detail.status !== EXECUTION_STATUS.PAUSED) {
      throw new Error("当前运行不在人工确认状态");
    }
    if (stored.checkpoint.pausedNodeId !== input.nodeId) {
      throw new Error("该节点不是当前等待确认的人工节点");
    }
    const executionGraph = structuredClone(stored.graphSnapshot);
    const node = executionGraph.nodes.find((item) => item.id === input.nodeId);
    if (!node || node.type !== "flux.business.humanReview") {
      throw new Error("未找到可确认的人工节点");
    }
    node.data = {
      ...node.data,
      decision: input.decision,
      reviewer: input.reviewer ?? node.data.reviewer,
      note: input.note ?? node.data.note,
    };
    stored.detail.logs.push({
      nodeId: input.nodeId,
      level: "info",
      message: input.decision === "approved"
        ? "人工确认通过，继续执行后续步骤"
        : "人工确认退回，继续退回分支",
      at: new Date().toISOString(),
    });
    return await executeGraph(
      stored.detail,
      stored.graphSnapshot,
      executionGraph,
      stored.checkpoint,
      onProgress,
      stored.effects ?? [],
    );
  } finally {
    approvalClaims.delete(executionId);
  }
}

export async function listLocalExecutions(): Promise<ExecutionDetail[]> {
  const snapshot = await readSnapshot();
  return snapshot.executions.map((entry) => structuredClone(entry.detail));
}
