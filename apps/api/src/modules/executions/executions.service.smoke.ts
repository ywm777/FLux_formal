import assert from "node:assert/strict";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import type { WorkflowGraph } from "@flux/workflow-schema";
import { InMemoryExecutionsRepository } from "../../database/memory/in-memory-executions.repository";
import { InMemoryWorkflowsRepository } from "../../database/memory/in-memory-workflows.repository";
import { CancelRegistry } from "./cancel-registry.service";
import type { ExecutionJob } from "./execution-processor.service";
import { ExecutionQueue } from "./execution-queue";
import { ExecutionsService } from "./executions.service";

class CapturingQueue extends ExecutionQueue {
  readonly jobs: ExecutionJob[] = [];

  async add(job: ExecutionJob): Promise<void> {
    this.jobs.push(job);
  }
}

const validGraph: WorkflowGraph = {
  id: "graph-valid",
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  meta: { title: "Valid", tags: [] },
  nodes: [
    {
      id: "start",
      type: "flux.trigger.manual",
      position: { x: 0, y: 0 },
      data: {},
      ports: {
        inputs: [],
        outputs: [
          { id: "out", name: "out", dataType: "any", capacity: "one" },
        ],
      },
    },
  ],
  edges: [],
};

const approvalGraph: WorkflowGraph = {
  id: "graph-approval",
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  meta: { title: "Approval", tags: [] },
  nodes: [
    {
      id: "review",
      type: "flux.business.humanReview",
      position: { x: 0, y: 0 },
      data: { reviewer: "销售主管", decision: "manual" },
      ports: {
        inputs: [
          { id: "in", name: "in", dataType: "any", capacity: "one" },
        ],
        outputs: [
          {
            id: "approved",
            name: "approved",
            dataType: "any",
            capacity: "one",
          },
          {
            id: "rejected",
            name: "rejected",
            dataType: "any",
            capacity: "one",
          },
        ],
      },
    },
  ],
  edges: [],
};

const runtimeInputGraph: WorkflowGraph = {
  id: "graph-runtime-input",
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  meta: { title: "Runtime input", tags: [] },
  nodes: [
    {
      id: "input",
      type: "flux.input.text",
      position: { x: 0, y: 0 },
      data: {},
      ports: {
        inputs: [],
        outputs: [
          { id: "out", name: "out", dataType: "any", capacity: "one" },
        ],
      },
    },
  ],
  edges: [],
};

const connectedRuntimeInputGraph: WorkflowGraph = {
  id: "graph-connected-runtime-input",
  version: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
  meta: { title: "Connected runtime input", tags: [] },
  nodes: [
    validGraph.nodes[0]!,
    {
      id: "relay",
      type: "flux.input.text",
      position: { x: 280, y: 0 },
      data: {},
      ports: {
        inputs: [
          { id: "in", name: "上游文本", dataType: "text", capacity: "one" },
        ],
        outputs: [
          { id: "out", name: "文本", dataType: "text", capacity: "one" },
        ],
      },
    },
  ],
  edges: [{ id: "start-relay", source: "start", target: "relay" }],
};

async function main(): Promise<void> {
  const executions = new InMemoryExecutionsRepository();
  const workflows = new InMemoryWorkflowsRepository();
  const queue = new CapturingQueue();
  const service = new ExecutionsService(
    executions,
    workflows,
    queue,
    new CancelRegistry(),
  );

  await assert.rejects(
    () => service.start("owner-a", "missing"),
    NotFoundException,
  );

  const foreign = await workflows.create({
    ownerId: "owner-b",
    workspaceId: "default",
    title: "Foreign",
    graph: validGraph,
  });
  await workflows.setStatus(foreign.id, "published");
  await assert.rejects(
    () => service.start("owner-a", foreign.id),
    NotFoundException,
  );

  const draft = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Draft",
    graph: validGraph,
  });
  await assert.rejects(
    () => service.start("owner-a", draft.id),
    ConflictException,
  );
  const draftTest = await service.startDraft("owner-a", draft.id);
  assert.equal(draftTest.status, "running");
  assert.equal(queue.jobs.length, 1);
  assert.deepEqual(queue.jobs[0]?.graph, validGraph);
  queue.jobs.length = 0;

  const approval = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Approval",
    graph: approvalGraph,
  });
  const approvalRun = await service.startDraft("owner-a", approval.id);
  assert.equal(queue.jobs.length, 1);
  queue.jobs.length = 0;
  await executions.markStatus(approvalRun.executionId, "paused");
  const continued = await service.approve("owner-a", approvalRun.executionId, {
    nodeId: "review",
    decision: "approved",
  });
  assert.equal(continued.status, "running");
  assert.equal(queue.jobs.length, 1);
  assert.equal(queue.jobs[0]?.executionId, approvalRun.executionId);
  const continuedGraph = queue.jobs[0]?.graph as WorkflowGraph;
  assert.equal(continuedGraph.nodes[0]?.data.decision, "approved");
  queue.jobs.length = 0;

  const malformed = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Malformed",
    graph: { nope: true },
  });
  await workflows.setStatus(malformed.id, "published");
  await assert.rejects(
    () => service.start("owner-a", malformed.id),
    BadRequestException,
  );

  const dangling = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Dangling",
    graph: {
      ...validGraph,
      id: "graph-dangling",
      edges: [{ id: "dangling", source: "start", target: "missing" }],
    },
  });
  await workflows.setStatus(dangling.id, "published");
  await assert.rejects(
    () => service.start("owner-a", dangling.id),
    BadRequestException,
  );

  const cyclicGraph: WorkflowGraph = {
    ...validGraph,
    id: "graph-cycle",
    nodes: [
      validGraph.nodes[0]!,
      {
        ...validGraph.nodes[0]!,
        id: "second",
        type: "flux.action.log",
      },
    ],
    edges: [
      { id: "a", source: "start", target: "second" },
      { id: "b", source: "second", target: "start" },
    ],
  };
  const cyclic = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Cyclic",
    graph: cyclicGraph,
  });
  await workflows.setStatus(cyclic.id, "published");
  await assert.rejects(
    () => service.start("owner-a", cyclic.id),
    BadRequestException,
  );

  const runtimeInput = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Runtime input",
    graph: runtimeInputGraph,
  });
  await workflows.setStatus(runtimeInput.id, "published");
  await assert.rejects(
    () => service.start("owner-a", runtimeInput.id),
    (error: unknown) =>
      error instanceof BadRequestException &&
      (error.getResponse() as { code?: string }).code === "EXECUTION_INPUT_REQUIRED",
  );
  const runtimeRun = await service.start("owner-a", runtimeInput.id, {
    input: { text: '{"name":"Flux"}' },
  });
  assert.equal(runtimeRun.status, "running");
  assert.equal(
    (queue.jobs[0]?.graph as WorkflowGraph).nodes[0]?.data.text,
    '{"name":"Flux"}',
  );
  assert.equal(
    ((await workflows.findById(runtimeInput.id))?.graph as WorkflowGraph).nodes[0]?.data.text,
    undefined,
  );
  queue.jobs.length = 0;

  const connectedRuntimeInput = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Connected runtime input",
    graph: connectedRuntimeInputGraph,
  });
  const connectedRun = await service.startDraft("owner-a", connectedRuntimeInput.id);
  assert.equal(connectedRun.status, "running");
  assert.equal(
    (queue.jobs[0]?.graph as WorkflowGraph).nodes.find((node) => node.id === "relay")?.data.text,
    "",
  );
  queue.jobs.length = 0;

  assert.equal((await executions.listByOwner("owner-a")).length, 4);

  const valid = await workflows.create({
    ownerId: "owner-a",
    workspaceId: "default",
    title: "Valid",
    graph: validGraph,
  });
  await workflows.setStatus(valid.id, "published");
  const result = await service.start("owner-a", valid.id);

  assert.equal(result.status, "running");
  assert.equal(queue.jobs.length, 1);
  assert.deepEqual(queue.jobs[0]?.graph, validGraph);
  console.log("executions service smoke passed");
}

void main();
