import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_WORKFLOW_SCHEMA_VERSION } from "@flux/workflow-schema";
import {
  createLocalWorkflowScheduler,
  type LocalWorkflowSchedulerDependencies,
} from "../src/lib/localWorkflowSchedulerCore.ts";
import type { LocalSchedulerSnapshot } from "../src/store/localSchedulerStore.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function workflow(id: string, cron = "*/5 * * * *", timezone = "Asia/Shanghai") {
  return {
    id,
    title: `流程 ${id}`,
    graph: {
      schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
      id,
      version: 1,
      viewport: { x: 0, y: 0, zoom: 1 },
      meta: { title: `流程 ${id}`, tags: [] },
      nodes: [{
        id: `cron-${id}`,
        type: "flux.trigger.cron",
        position: { x: 0, y: 0 },
        data: { cron, timezone },
        ports: { inputs: [], outputs: [{ id: "out", name: "开始", dataType: "any", capacity: "many" as const }] },
      }],
      edges: [],
    },
  };
}

function schedulerHarness(options: {
  workflows?: ReturnType<typeof workflow>[];
  persisted?: string | null;
} = {}) {
  let current = new Date("2026-07-24T07:30:20.000Z");
  let persisted = options.persisted ?? null;
  const runs: string[] = [];
  const snapshots: LocalSchedulerSnapshot[] = [];
  const dependencies: LocalWorkflowSchedulerDependencies = {
    loadWorkflows: async () => options.workflows ?? [workflow("a")],
    runWorkflow: async (workflowId) => {
      runs.push(workflowId);
      return { executionId: `exec-${runs.length}`, status: "success" };
    },
    readState: async () => persisted,
    writeState: async (value) => { persisted = value; },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    now: () => new Date(current),
    setInterval: () => 1 as ReturnType<typeof globalThis.setInterval>,
    clearInterval: () => undefined,
  };
  return {
    dependencies,
    runs,
    snapshots,
    persisted: () => persisted,
    setNow: (iso: string) => { current = new Date(iso); },
  };
}

test("a due workflow runs once per scheduled minute and exposes its next run", async () => {
  const harness = schedulerHarness();
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();
  await scheduler.refresh();
  assert.deepEqual(harness.runs, ["a"]);
  const view = harness.snapshots.at(-1)?.workflows.a;
  assert.equal(view?.status, "success");
  assert.equal(view?.nextRunAt, "2026-07-24T07:35:00.000Z");
  assert.equal(view?.lastScheduledFor, "2026-07-24T07:30:00.000Z");
  assert.equal(view?.lastRunAt, "2026-07-24T07:30:20.000Z");
});

test("persisted claims prevent a ghost duplicate after scheduler restart", async () => {
  const first = schedulerHarness();
  const firstScheduler = createLocalWorkflowScheduler(first.dependencies);
  await firstScheduler.start();
  firstScheduler.stop();

  const second = schedulerHarness({ persisted: first.persisted() });
  const secondScheduler = createLocalWorkflowScheduler(second.dependencies);
  await secondScheduler.start();
  assert.deepEqual(second.runs, []);
  assert.equal(second.snapshots.at(-1)?.workflows.a?.status, "success");
});

test("missed timer minutes are collapsed into one catch-up execution", async () => {
  const harness = schedulerHarness();
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();
  harness.setNow("2026-07-24T07:42:00.000Z");
  await scheduler.refresh();
  assert.deepEqual(harness.runs, ["a", "a"]);
  assert.equal(
    harness.snapshots.at(-1)?.workflows.a?.nextRunAt,
    "2026-07-24T07:45:00.000Z",
  );
});

test("changing a schedule clears the previous schedule's run status", async () => {
  const scheduledWorkflow = workflow("a");
  const harness = schedulerHarness({ workflows: [scheduledWorkflow] });
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();

  assert.equal(harness.snapshots.at(-1)?.workflows.a?.status, "success");
  assert.ok(harness.snapshots.at(-1)?.workflows.a?.lastRunAt);

  scheduledWorkflow.graph.nodes[0]!.data.cron = "0 9 * * *";
  harness.setNow("2026-07-24T07:31:00.000Z");
  await scheduler.refresh();

  const view = harness.snapshots.at(-1)?.workflows.a;
  assert.equal(view?.status, "waiting");
  assert.equal(view?.lastRunAt, null);
  assert.equal(view?.lastScheduledFor, null);
  assert.equal(view?.lastExecutionId, null);
  assert.deepEqual(JSON.parse(harness.persisted() ?? "{}").runs, {});
});

test("legacy runs without a matching schedule signature are not shown", async () => {
  const persisted = JSON.stringify({
    schemaVersion: 1,
    claims: { "a:cron-a": "2026-07-24T21:15@Asia/Shanghai" },
    runs: {
      a: {
        status: "success",
        startedAt: "2026-07-24T13:15:04.638Z",
        finishedAt: "2026-07-24T13:15:04.945Z",
        executionId: "legacy-execution",
      },
    },
  });
  const harness = schedulerHarness({
    workflows: [workflow("a", "0 9 * * *")],
    persisted,
  });
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();

  const view = harness.snapshots.at(-1)?.workflows.a;
  assert.equal(view?.status, "waiting");
  assert.equal(view?.lastRunAt, null);
  assert.equal(view?.lastScheduledFor, null);
  assert.equal(view?.lastExecutionId, null);
});

test("a legacy run is migrated when its claimed slot matches the current schedule", async () => {
  const persisted = JSON.stringify({
    schemaVersion: 1,
    claims: { "a:cron-a": "2026-07-24T15:30@Asia/Shanghai" },
    runs: {
      a: {
        status: "success",
        startedAt: "2026-07-24T07:30:20.000Z",
        finishedAt: "2026-07-24T07:30:21.000Z",
        executionId: "legacy-execution",
      },
    },
  });
  const harness = schedulerHarness({ persisted });
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();

  const view = harness.snapshots.at(-1)?.workflows.a;
  assert.equal(view?.status, "success");
  assert.equal(view?.lastRunAt, "2026-07-24T07:30:21.000Z");
  assert.equal(view?.lastScheduledFor, "2026-07-24T07:30:00.000Z");
  assert.equal(view?.lastExecutionId, "legacy-execution");
  const migratedRun = JSON.parse(harness.persisted() ?? "{}").runs.a;
  assert.equal(typeof migratedRun.scheduleSignature, "string");
  assert.equal(migratedRun.scheduledFor, "2026-07-24T07:30:00.000Z");
});

test("due workflows start concurrently instead of blocking one another", async () => {
  const harness = schedulerHarness({ workflows: [workflow("a"), workflow("b")] });
  let activeRuns = 0;
  let maximumActiveRuns = 0;
  harness.dependencies.runWorkflow = async (workflowId) => {
    harness.runs.push(workflowId);
    activeRuns += 1;
    maximumActiveRuns = Math.max(maximumActiveRuns, activeRuns);
    await new Promise((resolve) => setTimeout(resolve, 0));
    activeRuns -= 1;
    return { executionId: `exec-${workflowId}`, status: "success" };
  };
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();
  assert.equal(maximumActiveRuns, 2);
  assert.deepEqual(harness.runs.sort(), ["a", "b"]);
});

test("a long-running workflow does not block later scheduler scans", async () => {
  const workflows = [workflow("a")];
  const harness = schedulerHarness({ workflows });
  const firstRun = deferred();
  let intervalTick: (() => void) | null = null;
  harness.dependencies.setInterval = (callback) => {
    intervalTick = callback;
    return 1 as ReturnType<typeof globalThis.setInterval>;
  };
  harness.dependencies.runWorkflow = async (workflowId) => {
    harness.runs.push(workflowId);
    if (workflowId === "a") await firstRun.promise;
    return { executionId: `exec-${workflowId}`, status: "success" };
  };

  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  const starting = scheduler.start();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.runs, ["a"]);

  workflows.push(workflow("b"));
  harness.setNow("2026-07-24T07:35:00.000Z");
  intervalTick?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.runs, ["a", "b"]);

  firstRun.resolve();
  await starting;
});

test("invalid schedules stay observable and never execute", async () => {
  const harness = schedulerHarness({ workflows: [workflow("a", "0 25 * * *")] });
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();
  assert.deepEqual(harness.runs, []);
  assert.equal(harness.snapshots.at(-1)?.workflows.a?.status, "invalid");
});

test("a disabled timer keeps its plan but does not execute until enabled", async () => {
  const pausedWorkflow = workflow("a");
  pausedWorkflow.graph.nodes[0]!.data.enabled = false;
  const harness = schedulerHarness({ workflows: [pausedWorkflow] });
  const scheduler = createLocalWorkflowScheduler(harness.dependencies);
  await scheduler.start();

  assert.deepEqual(harness.runs, []);
  assert.equal(harness.snapshots.at(-1)?.workflows.a?.status, "disabled");
  assert.equal(harness.snapshots.at(-1)?.workflows.a?.nextRunAt, null);

  pausedWorkflow.graph.nodes[0]!.data.enabled = true;
  await scheduler.refresh();
  assert.deepEqual(harness.runs, ["a"]);
  assert.equal(harness.snapshots.at(-1)?.workflows.a?.status, "success");
});
