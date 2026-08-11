/* eslint-disable no-console */
import assert from "node:assert/strict";
import { CURRENT_WORKFLOW_SCHEMA_VERSION, type WorkflowGraph } from "@flux/workflow-schema";
import { InMemoryExecutionsRepository } from "../../database/memory/in-memory-executions.repository";
import { CancelRegistry } from "./cancel-registry.service";
import { ExecutionProcessor } from "./execution-processor.service";

const graph: WorkflowGraph = {
  schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
  id: "distributed-control",
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  meta: { title: "Distributed control", tags: [] },
  nodes: [
    {
      id: "delay",
      type: "flux.action.delay",
      position: { x: 0, y: 0 },
      data: { ms: 150 },
      ports: {
        inputs: [{ id: "in", name: "输入", dataType: "any", capacity: "one" }],
        outputs: [{ id: "out", name: "输出", dataType: "any", capacity: "one" }],
      },
    },
    {
      id: "log",
      type: "flux.action.log",
      position: { x: 240, y: 0 },
      data: { message: "resumed" },
      ports: {
        inputs: [{ id: "in", name: "输入", dataType: "any", capacity: "one" }],
        outputs: [{ id: "out", name: "输出", dataType: "any", capacity: "one" }],
      },
    },
  ],
  edges: [{ id: "delay-log", source: "delay", target: "log", sourcePort: "out", targetPort: "in" }],
};

async function main(): Promise<void> {
  const originalPollMs = process.env.EXEC_CONTROL_POLL_MS;
  process.env.EXEC_CONTROL_POLL_MS = "50";
  try {
    const executions = new InMemoryExecutionsRepository();
    const processor = new ExecutionProcessor(executions, new CancelRegistry());

    const pausable = await executions.create({
      workflowId: "workflow-pause",
      ownerId: "owner",
      graphSnapshot: graph,
    });
    const processing = processor.process({
      executionId: pausable.id,
      workflowId: pausable.workflowId,
      ownerId: pausable.ownerId,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(await executions.requestControl(pausable.id, "pause"), true);
    await processing;

    const paused = await executions.findById(pausable.id);
    const pausedState = await executions.getResumeState(pausable.id);
    assert.equal(paused?.status, "paused");
    assert.equal(pausedState?.checkpoint?.pausedNodeId, undefined);
    assert.deepEqual(pausedState?.checkpoint?.completedRuns, []);
    assert.equal(await executions.getControlRequest(pausable.id), null);

    assert.equal(
      await executions.transitionStatus(pausable.id, "paused", "running"),
      true,
    );
    await processor.process({
      executionId: pausable.id,
      workflowId: pausable.workflowId,
      ownerId: pausable.ownerId,
      resumeId: "smoke-resume",
    });
    const resumed = await executions.findById(pausable.id);
    assert.equal(resumed?.status, "success");
    assert.deepEqual(
      resumed?.runs.map((run) => [run.nodeId, run.status]),
      [["delay", "success"], ["log", "success"]],
    );

    const queued = await executions.create({
      workflowId: "workflow-queued-cancel",
      ownerId: "owner",
      graphSnapshot: graph,
    });
    assert.equal(await executions.requestControl(queued.id, "terminate"), true);
    await processor.process({
      executionId: queued.id,
      workflowId: queued.workflowId,
      ownerId: queued.ownerId,
    });
    assert.equal((await executions.findById(queued.id))?.status, "cancelled");
    assert.equal(await executions.getControlRequest(queued.id), null);

    const duplicated = await executions.create({
      workflowId: "workflow-duplicate-delivery",
      ownerId: "owner",
      graphSnapshot: graph,
    });
    const duplicateJob = {
      executionId: duplicated.id,
      workflowId: duplicated.workflowId,
      ownerId: duplicated.ownerId,
    };
    await Promise.all([
      processor.process(duplicateJob),
      processor.process(duplicateJob),
    ]);
    assert.equal((await executions.findById(duplicated.id))?.status, "success");
    assert.equal(
      (await executions.getLogs(duplicated.id)).filter((entry) => entry.message === "resumed").length,
      1,
      "duplicate delivery must have a single worker winner",
    );

    const leaseFixture = await executions.create({
      workflowId: "workflow-lease-expiry",
      ownerId: "owner",
      graphSnapshot: graph,
    });
    assert.equal(await executions.claimLease(leaseFixture.id, "worker-a", 5), true);
    assert.equal(await executions.claimLease(leaseFixture.id, "worker-b", 5), false);
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(await executions.claimLease(leaseFixture.id, "worker-b", 5), true);
    assert.equal(await executions.renewLease(leaseFixture.id, "worker-a", 5), false);
    await executions.releaseLease(leaseFixture.id, "worker-b");

    console.log("✅ distributed execution control smoke 全部通过");
  } finally {
    if (originalPollMs === undefined) delete process.env.EXEC_CONTROL_POLL_MS;
    else process.env.EXEC_CONTROL_POLL_MS = originalPollMs;
  }
}

void main();
