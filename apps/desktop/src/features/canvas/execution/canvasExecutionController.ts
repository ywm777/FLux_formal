import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  type ExecutionDetail,
  type ExecutionNodeInputs,
  type NodeRunRecord,
} from "@flux/shared";
import {
  buildCanvasExecutionPlaybackFrames,
  findCanvasExecutionApproval,
  prepareCanvasExecutionInputs,
  type CanvasExecutionDisplay,
  type CanvasExecutionResult,
  type CanvasRuntimeInputDescriptor,
} from "./canvasExecution.ts";

type ExecutionProgressHandler = (detail: ExecutionDetail) => void;

export interface CanvasExecutionControllerPorts {
  runDraft(
    workflowId: string,
    inputs: ExecutionNodeInputs,
    onProgress?: ExecutionProgressHandler,
  ): Promise<CanvasExecutionResult>;
  approveRun(
    executionId: string,
    input: {
      nodeId: string;
      decision: "approved" | "rejected";
    },
    onProgress?: ExecutionProgressHandler,
  ): Promise<CanvasExecutionResult>;
  setTesting(testing: boolean): void;
  applyNodeRuns(runs: NodeRunRecord[]): void;
  clearNodeRuns(): void;
  initializeNodeRuns(): void;
  selectNode(nodeId: string): void;
  wait(milliseconds: number): Promise<void>;
  formatError(error: unknown, fallback: string): string;
}

export interface CanvasExecutionRunRequest {
  runtimeInputs: CanvasRuntimeInputDescriptor[];
  saveWorkflow(): Promise<unknown | null>;
  getWorkflowId(): string | null;
  getSaveError(): string | null;
}

export interface CanvasExecutionSnapshot {
  detail: ExecutionDetail | null;
  result: CanvasExecutionResult | null;
  display: CanvasExecutionDisplay | null;
  runError: string | null;
  runtimeInputError: string | null;
  runtimeInputRevision: number;
}

type SnapshotPatch = Partial<Omit<CanvasExecutionSnapshot, "display">>;

function createSnapshot(): CanvasExecutionSnapshot {
  return {
    detail: null,
    result: null,
    display: null,
    runError: null,
    runtimeInputError: null,
    runtimeInputRevision: 0,
  };
}

export class CanvasExecutionController {
  private ports: CanvasExecutionControllerPorts;
  private snapshot = createSnapshot();
  private drafts: ExecutionNodeInputs = {};
  private token = 0;
  private listeners = new Set<() => void>();

  constructor(ports: CanvasExecutionControllerPorts) {
    this.ports = ports;
  }

  updatePorts(ports: CanvasExecutionControllerPorts): void {
    this.ports = ports;
  }

  getSnapshot = (): CanvasExecutionSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getRuntimeInput(nodeId: string): Record<string, unknown> | undefined {
    return this.drafts[nodeId];
  }

  updateRuntimeInput(nodeId: string, value: Record<string, unknown>): void {
    this.invalidateAndClear(false);
    this.drafts = { ...this.drafts, [nodeId]: value };
  }

  clear = (): void => {
    this.invalidateAndClear(false);
  };

  reset = (): void => {
    this.invalidateAndClear(true);
  };

  dispose = (): void => {
    this.token += 1;
    this.ports.setTesting(false);
    this.listeners.clear();
  };

  async run(request: CanvasExecutionRunRequest): Promise<void> {
    const prepared = prepareCanvasExecutionInputs(request.runtimeInputs, this.drafts);
    if (prepared.missingNodeId) {
      this.patch({ runtimeInputError: "请完成本次运行所需的输入" });
      this.ports.selectNode(prepared.missingNodeId);
      return;
    }

    const token = ++this.token;
    let observedActiveNode = false;
    this.patch({
      detail: null,
      result: null,
      runError: null,
      runtimeInputError: null,
    });
    this.ports.clearNodeRuns();
    this.ports.initializeNodeRuns();
    this.ports.setTesting(true);

    try {
      const saved = await request.saveWorkflow();
      if (!this.isCurrent(token)) return;
      if (!saved) {
        throw new Error(request.getSaveError() ?? "请先保存工作流");
      }
      const workflowId = request.getWorkflowId();
      if (!workflowId) throw new Error("请先保存工作流");

      const result = await this.ports.runDraft(
        workflowId,
        prepared.inputs,
        (detail) => {
          if (!this.isCurrent(token)) return;
          const hasActiveNode = detail.runs.some(
            (run) => run.status === NODE_RUN_STATUS.RUNNING,
          );
          observedActiveNode ||= hasActiveNode;
          if (detail.status === EXECUTION_STATUS.RUNNING || hasActiveNode) {
            this.ports.applyNodeRuns(detail.runs);
            this.patch({ detail });
          }
        },
      );
      if (!this.isCurrent(token)) return;

      if (!observedActiveNode && result.runs.length > 0) {
        await this.playResult(result, token);
      } else {
        this.ports.applyNodeRuns(result.runs);
        this.patch({ detail: null, result });
      }
    } catch (error) {
      if (!this.isCurrent(token)) return;
      this.ports.clearNodeRuns();
      this.patch({
        detail: null,
        result: null,
        runError: this.ports.formatError(error, "执行工作流失败"),
      });
    } finally {
      if (this.isCurrent(token)) this.ports.setTesting(false);
    }
  }

  async approve(decision: "approved" | "rejected"): Promise<void> {
    const approval = findCanvasExecutionApproval(this.snapshot.display);
    if (!approval) return;
    const token = ++this.token;
    this.patch({ runError: null });
    this.ports.setTesting(true);

    try {
      const result = await this.ports.approveRun(
        approval.executionId,
        { nodeId: approval.nodeId, decision },
        (detail) => {
          if (!this.isCurrent(token)) return;
          this.ports.applyNodeRuns(detail.runs);
          this.patch({ detail });
        },
      );
      if (!this.isCurrent(token)) return;
      this.ports.applyNodeRuns(result.runs);
      this.patch({ detail: null, result });
    } catch (error) {
      if (!this.isCurrent(token)) return;
      this.patch({
        runError: this.ports.formatError(error, "人工确认失败"),
      });
    } finally {
      if (this.isCurrent(token)) this.ports.setTesting(false);
    }
  }

  private async playResult(
    result: CanvasExecutionResult,
    token: number,
  ): Promise<void> {
    const frames = buildCanvasExecutionPlaybackFrames(result);
    for (const frame of frames) {
      if (!this.isCurrent(token)) return;
      this.ports.applyNodeRuns(frame.runs);
      this.patch({
        detail: null,
        result: {
          ...result,
          status: EXECUTION_STATUS.RUNNING,
          runs: frame.runs,
        },
      });
      if (frame.delayAfter > 0) await this.ports.wait(frame.delayAfter);
    }
    if (!this.isCurrent(token)) return;
    this.ports.applyNodeRuns(result.runs);
    this.patch({ detail: null, result });
  }

  private invalidateAndClear(resetDrafts: boolean): void {
    this.token += 1;
    this.ports.setTesting(false);
    this.ports.clearNodeRuns();
    if (resetDrafts) this.drafts = {};
    this.patch({
      detail: null,
      result: null,
      runError: null,
      runtimeInputError: null,
      runtimeInputRevision: resetDrafts
        ? this.snapshot.runtimeInputRevision + 1
        : this.snapshot.runtimeInputRevision,
    });
  }

  private isCurrent(token: number): boolean {
    return token === this.token;
  }

  private patch(patch: SnapshotPatch): void {
    const detail = patch.detail === undefined ? this.snapshot.detail : patch.detail;
    const result = patch.result === undefined ? this.snapshot.result : patch.result;
    this.snapshot = {
      ...this.snapshot,
      ...patch,
      detail,
      result,
      display: detail ?? result,
    };
    for (const listener of this.listeners) listener();
  }
}
