import assert from "node:assert/strict";
import test from "node:test";
import {
  EXECUTION_STATUS,
  NODE_RUN_STATUS,
  type ExecutionDetail,
  type NodeRunRecord,
} from "@flux/shared";
import {
  buildCanvasExecutionPlaybackFrames,
  findCanvasExecutionApproval,
  getCanvasExecutionId,
  prepareCanvasExecutionInputs,
  type CanvasExecutionResult,
  type CanvasRuntimeInputDescriptor,
} from "../src/features/canvas/execution/canvasExecution.ts";
import {
  CanvasExecutionController,
  type CanvasExecutionControllerPorts,
} from "../src/features/canvas/execution/canvasExecutionController.ts";

const requiredInput: CanvasRuntimeInputDescriptor = {
  nodeId: "input",
  defaults: { text: "" },
  required: ["text"],
  upstreamFallback: true,
  hasUpstream: false,
};

function result(
  executionId: string,
  status = EXECUTION_STATUS.SUCCESS,
  runs: NodeRunRecord[] = [{
    nodeId: "input",
    type: "flux.input.text",
    status: NODE_RUN_STATUS.SUCCESS,
  }],
): CanvasExecutionResult {
  return {
    executionId,
    status,
    order: runs.map((run) => run.nodeId),
    runs,
    logs: [],
  };
}

function detail(
  id: string,
  status = EXECUTION_STATUS.RUNNING,
): ExecutionDetail {
  return {
    id,
    workflowId: "workflow",
    ownerId: "local-user",
    status,
    startedAt: "2026-07-20T00:00:00.000Z",
    order: ["input"],
    runs: [{
      nodeId: "input",
      type: "flux.input.text",
      status: NODE_RUN_STATUS.RUNNING,
    }],
    logs: [],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createPorts(overrides: Partial<CanvasExecutionControllerPorts> = {}) {
  const testing: boolean[] = [];
  const appliedRuns: NodeRunRecord[][] = [];
  const selectedNodes: string[] = [];
  let cleared = 0;
  let initialized = 0;
  const ports: CanvasExecutionControllerPorts = {
    runDraft: async () => result("default"),
    approveRun: async () => result("approved"),
    setTesting(value) {
      testing.push(value);
    },
    applyNodeRuns(runs) {
      appliedRuns.push(structuredClone(runs));
    },
    clearNodeRuns() {
      cleared += 1;
    },
    initializeNodeRuns() {
      initialized += 1;
    },
    selectNode(nodeId) {
      selectedNodes.push(nodeId);
    },
    wait: async () => undefined,
    formatError(error, fallback) {
      return error instanceof Error ? error.message : fallback;
    },
    ...overrides,
  };
  return {
    ports,
    testing,
    appliedRuns,
    selectedNodes,
    get cleared() {
      return cleared;
    },
    get initialized() {
      return initialized;
    },
  };
}

const runRequest = {
  runtimeInputs: [requiredInput],
  saveWorkflow: async () => ({ id: "workflow" }),
  getWorkflowId: () => "workflow",
  getSaveError: () => null,
};

test("runtime input preparation merges drafts and reports the first missing node", () => {
  assert.deepEqual(
    prepareCanvasExecutionInputs([requiredInput], {}),
    { inputs: { input: { text: "" } }, missingNodeId: "input" },
  );
  assert.deepEqual(
    prepareCanvasExecutionInputs([requiredInput], { input: { text: "hello" } }),
    { inputs: { input: { text: "hello" } }, missingNodeId: null },
  );
});

test("an upstream connection satisfies fallback runtime input", () => {
  assert.deepEqual(
    prepareCanvasExecutionInputs([{ ...requiredInput, hasUpstream: true }], {}),
    { inputs: { input: { text: "" } }, missingNodeId: null },
  );
});

test("playback frames expose pending, running, and final node states in order", () => {
  const execution = result("frames", EXECUTION_STATUS.SUCCESS, [
    { nodeId: "a", type: "a", status: NODE_RUN_STATUS.SUCCESS },
    { nodeId: "b", type: "b", status: NODE_RUN_STATUS.SKIPPED },
  ]);
  const frames = buildCanvasExecutionPlaybackFrames(execution);
  assert.equal(frames[0]?.runs.every((run) => run.status === NODE_RUN_STATUS.PENDING), true);
  assert.equal(frames.some((frame) => frame.runs[0]?.status === NODE_RUN_STATUS.RUNNING), true);
  assert.deepEqual(frames.at(-1)?.runs, execution.runs);
});

test("approval discovery supports detail and response execution identifiers", () => {
  const pausedRuns: NodeRunRecord[] = [{
    nodeId: "review",
    type: "flux.business.humanReview",
    status: NODE_RUN_STATUS.RUNNING,
  }];
  const paused = result("response-id", EXECUTION_STATUS.PAUSED, pausedRuns);
  assert.equal(getCanvasExecutionId(paused), "response-id");
  assert.deepEqual(findCanvasExecutionApproval(paused), {
    executionId: "response-id",
    nodeId: "review",
  });
  assert.equal(getCanvasExecutionId(detail("detail-id")), "detail-id");
});

test("preflight selects the missing node without saving or running", async () => {
  let saved = 0;
  let ran = 0;
  const fixture = createPorts({
    runDraft: async () => {
      ran += 1;
      return result("unexpected");
    },
  });
  const controller = new CanvasExecutionController(fixture.ports);
  await controller.run({
    ...runRequest,
    saveWorkflow: async () => {
      saved += 1;
      return {};
    },
  });
  assert.equal(saved, 0);
  assert.equal(ran, 0);
  assert.deepEqual(fixture.selectedNodes, ["input"]);
  assert.equal(controller.getSnapshot().runtimeInputError, "请完成本次运行所需的输入");
});

test("a valid run saves before the execution port and publishes the result", async () => {
  const order: string[] = [];
  const fixture = createPorts({
    runDraft: async (_workflowId, inputs) => {
      order.push(`run:${String(inputs.input?.text)}`);
      return result("completed");
    },
  });
  const controller = new CanvasExecutionController(fixture.ports);
  controller.updateRuntimeInput("input", { text: "ready" });
  await controller.run({
    ...runRequest,
    saveWorkflow: async () => {
      order.push("save");
      return {};
    },
  });
  assert.deepEqual(order, ["save", "run:ready"]);
  assert.equal(controller.getSnapshot().result?.executionId, "completed");
  assert.deepEqual(fixture.testing.slice(-2), [true, false]);
});

test("a stale run cannot publish progress, result, or finally over a newer run", async () => {
  const first = deferred<CanvasExecutionResult>();
  const second = deferred<CanvasExecutionResult>();
  const progress: Array<((detail: ExecutionDetail) => void) | undefined> = [];
  let call = 0;
  const fixture = createPorts({
    runDraft: (_workflowId, _inputs, onProgress) => {
      progress.push(onProgress);
      call += 1;
      return call === 1 ? first.promise : second.promise;
    },
  });
  const controller = new CanvasExecutionController(fixture.ports);
  controller.updateRuntimeInput("input", { text: "ready" });
  const firstRun = controller.run(runRequest);
  await Promise.resolve();
  await Promise.resolve();
  const secondRun = controller.run(runRequest);
  await Promise.resolve();
  await Promise.resolve();

  progress[0]?.(detail("stale-progress"));
  assert.notEqual(controller.getSnapshot().detail?.id, "stale-progress");

  second.resolve(result("newest"));
  await secondRun;
  first.resolve(result("stale"));
  await firstRun;

  assert.equal(controller.getSnapshot().result?.executionId, "newest");
  assert.deepEqual(fixture.testing.slice(-3), [true, true, false]);
});

test("clear invalidates pending work and closes testing", async () => {
  const pending = deferred<CanvasExecutionResult>();
  const fixture = createPorts({ runDraft: async () => pending.promise });
  const controller = new CanvasExecutionController(fixture.ports);
  controller.updateRuntimeInput("input", { text: "ready" });
  const running = controller.run(runRequest);
  await Promise.resolve();
  await Promise.resolve();
  controller.clear();
  pending.resolve(result("late"));
  await running;
  assert.equal(controller.getSnapshot().result, null);
  assert.equal(fixture.testing.at(-1), false);
});

test("approval continues only the current paused human-review execution", async () => {
  const paused = result("paused", EXECUTION_STATUS.PAUSED, [{
    nodeId: "review",
    type: "flux.business.humanReview",
    status: NODE_RUN_STATUS.RUNNING,
  }]);
  let approvalInput: { executionId: string; nodeId: string; decision: string } | null = null;
  const fixture = createPorts({
    runDraft: async () => paused,
    approveRun: async (executionId, input) => {
      approvalInput = { executionId, ...input };
      return result("continued");
    },
  });
  const controller = new CanvasExecutionController(fixture.ports);
  controller.updateRuntimeInput("input", { text: "ready" });
  await controller.run(runRequest);
  await controller.approve("approved");
  assert.deepEqual(approvalInput, {
    executionId: "paused",
    nodeId: "review",
    decision: "approved",
  });
  assert.equal(controller.getSnapshot().result?.executionId, "continued");
});
