import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_WORKFLOW_SCHEMA_VERSION, type WorkflowGraph } from "@flux/workflow-schema";
import {
  approveLocalExecutionAndContinue,
  runLocalDraftExecution,
} from "../src/lib/localExecution.ts";
import { localWorkspaceRepository } from "../src/lib/localWorkspaceRepository.ts";
import { defineNode } from "@flux/node-sdk";
import { registry } from "../src/lib/registry.ts";
import { localHttpConnectionRepository } from "../src/lib/capabilities/localHttpConnectionRepository.ts";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

function reviewGraph(nodeId = "review"): WorkflowGraph {
  return {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    id: "local-resume",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    meta: { title: "Local resume", tags: [] },
    nodes: [{
      id: nodeId,
      type: "flux.business.humanReview",
      position: { x: 0, y: 0 },
      data: { reviewer: "负责人", decision: "manual" },
      ports: {
        inputs: [{ id: "in", name: "in", dataType: "any", capacity: "one" }],
        outputs: [
          { id: "approved", name: "approved", dataType: "any", capacity: "one" },
          { id: "rejected", name: "rejected", dataType: "any", capacity: "one" },
        ],
      },
    }],
    edges: [],
  };
}

test("local approval resumes the persisted immutable graph and checkpoint", async () => {
  const localStorage = new MemoryStorage();
  Object.assign(globalThis, { window: { localStorage } });

  const workflow = await localWorkspaceRepository.create("Approval", reviewGraph());
  const paused = await runLocalDraftExecution(workflow.id);
  assert.equal(paused.status, "paused");

  const persistedAtPause = JSON.parse(
    localStorage.getItem("flux.desktop.local-executions") ?? "{}",
  );
  const pausedEntry = persistedAtPause.executions[0];
  assert.equal(persistedAtPause.schemaVersion, 3);
  assert.equal(pausedEntry.graphSnapshot.nodes[0].id, "review");
  assert.equal(pausedEntry.graphSnapshot.nodes[0].data.decision, "manual");
  assert.equal(pausedEntry.checkpoint.pausedNodeId, "review");

  await localWorkspaceRepository.update(workflow.id, {
    graph: reviewGraph("replacement-review"),
    expectedVersion: workflow.version,
  });
  const resumed = await approveLocalExecutionAndContinue(paused.executionId, {
    nodeId: "review",
    decision: "approved",
  });

  assert.equal(resumed.status, "success");
  assert.deepEqual(resumed.order, ["review"]);
  const persistedAfterResume = JSON.parse(
    localStorage.getItem("flux.desktop.local-executions") ?? "{}",
  ).executions[0];
  assert.equal(
    persistedAfterResume.graphSnapshot.nodes[0].data.decision,
    "manual",
    "the immutable snapshot must not be overwritten with the decision overlay",
  );
  assert.equal(persistedAfterResume.checkpoint.pausedNodeId, undefined);
  assert.equal(persistedAfterResume.checkpoint.completedRuns[0].nodeId, "review");
  assert.ok("approved" in persistedAfterResume.checkpoint.completedRuns[0].outputs);
});

test("local duplicate approval has a single winner", async () => {
  const localStorage = new MemoryStorage();
  Object.assign(globalThis, { window: { localStorage } });
  const workflow = await localWorkspaceRepository.create("Approval", reviewGraph());
  const paused = await runLocalDraftExecution(workflow.id);

  const results = await Promise.allSettled([
    approveLocalExecutionAndContinue(paused.executionId, {
      nodeId: "review",
      decision: "approved",
    }),
    approveLocalExecutionAndContinue(paused.executionId, {
      nodeId: "review",
      decision: "approved",
    }),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("local capability effects persist a stable idempotency key and propagate it to HTTP", async () => {
  const localStorage = new MemoryStorage();
  Object.assign(globalThis, {
    window: {
      localStorage,
      setTimeout,
      clearTimeout,
    },
  });
  const nodeType = "test.local-effect-journal";
  registry.upsert(defineNode({
    id: nodeType,
    name: "Effect journal",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "app",
    ports: { inputs: [], outputs: [{ id: "out", name: "out" }] },
    configSchema: { type: "object" },
    async execute(context) {
      const result = await context.invoke("http_effect", "request", {
        method: "POST",
        path: "effects",
        body: { value: 1 },
      });
      return { outputs: { out: result } };
    },
  }));
  const now = new Date().toISOString();
  await localHttpConnectionRepository.write({
    schemaVersion: 1,
    connections: [{
      schemaVersion: 1,
      id: "http_effect",
      name: "Effect endpoint",
      baseUrl: "https://effects.example.com/v1",
      allowedPathPrefixes: ["effects"],
      allowedMethods: ["POST"],
      createdAt: now,
      updatedAt: now,
    }],
  });
  const graph: WorkflowGraph = {
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION,
    id: "local-effect-journal",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    meta: { title: "Effect journal", tags: [] },
    nodes: [{
      id: "effect",
      type: nodeType,
      position: { x: 0, y: 0 },
      data: {},
      ports: {
        inputs: [],
        outputs: [{ id: "out", name: "out", dataType: "any", capacity: "one" }],
      },
    }],
    edges: [],
  };
  const originalFetch = globalThis.fetch;
  let propagatedKey: string | null = null;
  globalThis.fetch = async (_input, init) => {
    propagatedKey = new Headers(init?.headers).get("Idempotency-Key");
    return new Response(JSON.stringify({ applied: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const workflow = await localWorkspaceRepository.create("Effect", graph);
    const result = await runLocalDraftExecution(workflow.id);
    assert.equal(result.status, "success");
    const persisted = JSON.parse(
      localStorage.getItem("flux.desktop.local-executions") ?? "{}",
    ).executions[0];
    assert.equal(persisted.effects.length, 1);
    assert.equal(persisted.effects[0].status, "completed");
    assert.match(persisted.effects[0].metadata.idempotencyKey, /^flux_[a-f0-9]{64}$/);
    assert.equal(propagatedKey, persisted.effects[0].metadata.idempotencyKey);
  } finally {
    globalThis.fetch = originalFetch;
    registry.unregister(nodeType);
  }
});
