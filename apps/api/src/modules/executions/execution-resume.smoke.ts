/* eslint-disable no-console */
import assert from "node:assert/strict";
import { CURRENT_WORKFLOW_SCHEMA_VERSION, type WorkflowGraph } from "@flux/workflow-schema";
import { InMemoryExecutionsRepository } from "../../database/memory/in-memory-executions.repository";
import { CancelRegistry } from "./cancel-registry.service";
import { ExecutionProcessor } from "./execution-processor.service";

const graph: WorkflowGraph = {
  schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
  id: "processor-resume",
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  meta: { title: "Processor resume", tags: [] },
  nodes: [
    {
      id: "source",
      type: "flux.trigger.manual",
      position: { x: 0, y: 0 },
      data: {},
      ports: {
        inputs: [],
        outputs: [{ id: "out", name: "out", dataType: "any", capacity: "many" }],
      },
    },
    {
      id: "review",
      type: "flux.business.humanReview",
      position: { x: 200, y: 0 },
      data: { reviewer: "负责人", decision: "manual" },
      ports: {
        inputs: [{ id: "in", name: "in", dataType: "any", capacity: "one" }],
        outputs: [
          { id: "approved", name: "approved", dataType: "any", capacity: "many" },
          { id: "rejected", name: "rejected", dataType: "any", capacity: "many" },
        ],
      },
    },
    {
      id: "sink",
      type: "flux.action.log",
      position: { x: 400, y: 0 },
      data: { message: "approved" },
      ports: {
        inputs: [{ id: "in", name: "in", dataType: "any", capacity: "one" }],
        outputs: [{ id: "out", name: "out", dataType: "any", capacity: "many" }],
      },
    },
  ],
  edges: [
    { id: "source-review", source: "source", target: "review", sourcePort: "out", targetPort: "in" },
    { id: "review-sink", source: "review", target: "sink", sourcePort: "approved", targetPort: "in" },
  ],
};

async function main(): Promise<void> {
  const executions = new InMemoryExecutionsRepository();
  const processor = new ExecutionProcessor(executions, new CancelRegistry());
  const execution = await executions.create({
    workflowId: "00000000-0000-0000-0000-000000000001",
    ownerId: "00000000-0000-0000-0000-000000000002",
    graphSnapshot: graph,
  });

  await processor.process({
    executionId: execution.id,
    workflowId: execution.workflowId,
    ownerId: execution.ownerId,
  });
  const paused = await executions.findById(execution.id);
  const pausedState = await executions.getResumeState(execution.id);
  assert.equal(paused?.status, "paused");
  assert.equal(pausedState?.checkpoint?.pausedNodeId, "review");
  const sourceBefore = pausedState?.checkpoint?.completedRuns.find(
    (run) => run.nodeId === "source",
  );
  assert.equal(sourceBefore?.status, "success");

  assert.equal(
    await executions.transitionStatus(execution.id, "paused", "running"),
    true,
  );
  await processor.process({
    executionId: execution.id,
    workflowId: execution.workflowId,
    ownerId: execution.ownerId,
    approval: { nodeId: "review", decision: "approved" },
  });

  const completed = await executions.findById(execution.id);
  const completedState = await executions.getResumeState(execution.id);
  assert.equal(completed?.status, "success");
  assert.equal(completedState?.checkpoint?.pausedNodeId, undefined);
  assert.deepEqual(
    completedState?.checkpoint?.completedRuns.find((run) => run.nodeId === "source"),
    sourceBefore,
    "processor must preserve the upstream output captured before approval",
  );
  assert.equal(
    completedState?.checkpoint?.completedRuns.find((run) => run.nodeId === "review")?.status,
    "success",
  );
  assert.equal(
    completedState?.checkpoint?.completedRuns.find((run) => run.nodeId === "sink")?.status,
    "success",
  );
  console.log("✅ execution resume smoke 全部通过");
}

void main();
