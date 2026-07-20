import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  type ExecutionDetail,
  type ExecutionLogEntry,
  type ExecutionNodeInputs,
  type ExecutionStatus,
  type NodeRunRecord,
} from "@flux/shared";

export interface CanvasExecutionResult {
  executionId: string;
  status: ExecutionStatus;
  order: string[];
  runs: NodeRunRecord[];
  logs: ExecutionLogEntry[];
  error?: string;
}

export type CanvasExecutionDisplay = ExecutionDetail | CanvasExecutionResult;

export interface CanvasRuntimeInputDescriptor {
  nodeId: string;
  defaults: Record<string, unknown>;
  required: string[];
  upstreamFallback: boolean;
  hasUpstream: boolean;
}

export interface PreparedCanvasExecutionInputs {
  inputs: ExecutionNodeInputs;
  missingNodeId: string | null;
}

export interface CanvasExecutionPlaybackFrame {
  runs: NodeRunRecord[];
  delayAfter: number;
}

export interface CanvasExecutionApproval {
  executionId: string;
  nodeId: string;
}

function hasValue(value: unknown): boolean {
  return value !== undefined &&
    value !== null &&
    !(typeof value === "string" && !value.trim());
}

export function prepareCanvasExecutionInputs(
  descriptors: CanvasRuntimeInputDescriptor[],
  drafts: ExecutionNodeInputs,
): PreparedCanvasExecutionInputs {
  const inputs: ExecutionNodeInputs = {};
  let missingNodeId: string | null = null;

  for (const descriptor of descriptors) {
    const value = drafts[descriptor.nodeId] ?? descriptor.defaults;
    inputs[descriptor.nodeId] = { ...value };
    const acceptsUpstream = descriptor.upstreamFallback && descriptor.hasUpstream;
    if (
      !missingNodeId &&
      !acceptsUpstream &&
      descriptor.required.some((key) => !hasValue(value[key]))
    ) {
      missingNodeId = descriptor.nodeId;
    }
  }

  return { inputs, missingNodeId };
}

function cloneRuns(runs: NodeRunRecord[]): NodeRunRecord[] {
  return runs.map((run) => run.outputs
    ? { ...run, outputs: structuredClone(run.outputs) }
    : { ...run });
}

export function buildCanvasExecutionPlaybackFrames(
  result: CanvasExecutionResult,
): CanvasExecutionPlaybackFrame[] {
  const finalRunById = new Map(result.runs.map((run) => [run.nodeId, run]));
  const visualRuns = result.runs.map((run): NodeRunRecord => ({
    nodeId: run.nodeId,
    type: run.type,
    status: NODE_RUN_STATUS.PENDING,
  }));
  const frames: CanvasExecutionPlaybackFrame[] = [
    { runs: cloneRuns(visualRuns), delayAfter: 0 },
  ];

  for (const nodeId of result.order) {
    const finalRun = finalRunById.get(nodeId);
    const visualRun = visualRuns.find((run) => run.nodeId === nodeId);
    if (!finalRun || !visualRun) continue;
    if (finalRun.status === NODE_RUN_STATUS.PENDING) break;

    if (finalRun.status !== NODE_RUN_STATUS.SKIPPED) {
      visualRun.status = NODE_RUN_STATUS.RUNNING;
      frames.push({ runs: cloneRuns(visualRuns), delayAfter: 420 });
    }

    Object.assign(visualRun, structuredClone(finalRun));
    frames.push({ runs: cloneRuns(visualRuns), delayAfter: 160 });

    if (
      finalRun.status === NODE_RUN_STATUS.RUNNING ||
      (
        finalRun.status === NODE_RUN_STATUS.FAILED &&
        result.status === EXECUTION_STATUS.FAILED
      )
    ) {
      break;
    }
  }

  return frames;
}

export function getCanvasExecutionId(
  display: CanvasExecutionDisplay | null,
): string | null {
  if (!display) return null;
  return "executionId" in display ? display.executionId : display.id;
}

export function findCanvasExecutionApproval(
  display: CanvasExecutionDisplay | null,
): CanvasExecutionApproval | null {
  if (!display || display.status !== EXECUTION_STATUS.PAUSED) return null;
  const executionId = getCanvasExecutionId(display);
  const run = display.runs.find(
    (item) =>
      item.status === NODE_RUN_STATUS.RUNNING &&
      item.type === "flux.business.humanReview",
  );
  return executionId && run
    ? { executionId, nodeId: run.nodeId }
    : null;
}
