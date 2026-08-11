import assert from "node:assert/strict";
import test from "node:test";
import { NodeRegistry, defineNode } from "@flux/node-sdk";
import { runWorkflow } from "../dist/index.js";

function node(id, type, inputs = [], outputs = ["out"]) {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: {},
    ports: {
      inputs: inputs.map((port) => ({
        id: port,
        name: port,
        dataType: "any",
        capacity: "one",
      })),
      outputs: outputs.map((port) => ({
        id: port,
        name: port,
        dataType: "any",
        capacity: "many",
      })),
    },
  };
}

test("manual approval resumes from checkpoint without replaying upstream work", async () => {
  const registry = new NodeRegistry();
  const calls = new Map();
  const received = [];
  const count = (id) => calls.set(id, (calls.get(id) ?? 0) + 1);

  registry.register(defineNode({
    id: "test.source",
    name: "Source",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "basic",
    ports: { inputs: [], outputs: [{ id: "out", name: "out" }] },
    configSchema: { type: "object" },
    async execute(context) {
      count(context.nodeId);
      return { outputs: { out: { sourceRun: calls.get(context.nodeId) } } };
    },
  }));
  registry.register(defineNode({
    id: "flux.business.humanReview",
    name: "Review",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "basic",
    ports: {
      inputs: [{ id: "in", name: "in" }],
      outputs: [
        { id: "approved", name: "approved" },
        { id: "rejected", name: "rejected" },
      ],
    },
    configSchema: { type: "object" },
    async execute(context) {
      count(context.nodeId);
      const decision = context.config.decision === "rejected"
        ? "rejected"
        : "approved";
      return { outputs: { [decision]: context.inputs } };
    },
  }));
  registry.register(defineNode({
    id: "test.sink",
    name: "Sink",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "basic",
    ports: {
      inputs: [{ id: "in", name: "in" }],
      outputs: [{ id: "out", name: "out" }],
    },
    configSchema: { type: "object" },
    async execute(context) {
      count(context.nodeId);
      received.push([context.nodeId, context.inputs]);
      return { outputs: { out: context.inputs } };
    },
  }));

  const graph = {
    schemaVersion: 2,
    id: "resume",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    meta: { title: "Resume", tags: [] },
    nodes: [
      node("source", "test.source"),
      { ...node("review", "flux.business.humanReview", ["in"], ["approved", "rejected"]), data: { decision: "manual" } },
      node("approved-sink", "test.sink", ["in"]),
      node("rejected-sink", "test.sink", ["in"]),
      node("sibling", "test.sink", ["in"]),
    ],
    edges: [
      { id: "source-review", source: "source", target: "review", sourcePort: "out", targetPort: "in" },
      { id: "source-sibling", source: "source", target: "sibling", sourcePort: "out", targetPort: "in" },
      { id: "review-approved", source: "review", target: "approved-sink", sourcePort: "approved", targetPort: "in" },
      { id: "review-rejected", source: "review", target: "rejected-sink", sourcePort: "rejected", targetPort: "in" },
    ],
  };

  const paused = await runWorkflow(graph, registry);
  assert.equal(paused.status, "paused");
  assert.equal(paused.checkpoint.pausedNodeId, "review");
  assert.equal(calls.get("source"), 1);
  assert.equal(calls.has("sibling"), false, "the sibling remained pending at the pause");

  const resumedGraph = structuredClone(graph);
  resumedGraph.nodes.find((item) => item.id === "review").data.decision = "approved";
  const resumed = await runWorkflow(resumedGraph, registry, {
    resumeFrom: paused.checkpoint,
  });

  assert.equal(resumed.status, "success");
  assert.equal(calls.get("source"), 1, "successful upstream work must not replay");
  assert.equal(calls.get("review"), 1, "the approval node executes exactly once with the decision");
  assert.equal(calls.get("approved-sink"), 1);
  assert.equal(calls.has("rejected-sink"), false);
  assert.equal(
    calls.get("sibling"),
    1,
    "an unfinished parallel branch must continue after the approval",
  );
  assert.deepEqual(received, [
    ["sibling", { sourceRun: 1 }],
    ["approved-sink", { sourceRun: 1 }],
  ]);
  assert.equal(
    resumed.runs.find((run) => run.nodeId === "sibling")?.status,
    "success",
  );
});

test("control pause keeps unfinished nodes resumable without marking them skipped", async () => {
  const registry = new NodeRegistry();
  const calls = new Map();
  const count = (id) => calls.set(id, (calls.get(id) ?? 0) + 1);
  const controller = new AbortController();

  registry.register(defineNode({
    id: "test.pause-source",
    name: "Source",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "basic",
    ports: { inputs: [], outputs: [{ id: "out", name: "out" }] },
    configSchema: { type: "object" },
    async execute(context) {
      count(context.nodeId);
      return { outputs: { out: { value: "once" } } };
    },
  }));
  registry.register(defineNode({
    id: "test.pause-blocker",
    name: "Blocker",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "basic",
    ports: {
      inputs: [{ id: "in", name: "in" }],
      outputs: [{ id: "out", name: "out" }],
    },
    configSchema: { type: "object" },
    async execute(context) {
      count(context.nodeId);
      if (calls.get(context.nodeId) === 1) {
        queueMicrotask(() => controller.abort("pause"));
        await new Promise((resolve, reject) => {
          context.signal.addEventListener("abort", () => reject(new Error("paused")), {
            once: true,
          });
        });
      }
      return { outputs: { out: context.inputs } };
    },
  }));
  registry.register(defineNode({
    id: "test.pause-sink",
    name: "Sink",
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "basic",
    ports: {
      inputs: [{ id: "in", name: "in" }],
      outputs: [{ id: "out", name: "out" }],
    },
    configSchema: { type: "object" },
    async execute(context) {
      count(context.nodeId);
      return { outputs: { out: context.inputs } };
    },
  }));

  const graph = {
    schemaVersion: 2,
    id: "control-pause",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    meta: { title: "Control pause", tags: [] },
    nodes: [
      node("source", "test.pause-source"),
      node("blocker", "test.pause-blocker", ["in"]),
      node("sink", "test.pause-sink", ["in"]),
    ],
    edges: [
      { id: "source-blocker", source: "source", target: "blocker", sourcePort: "out", targetPort: "in" },
      { id: "blocker-sink", source: "blocker", target: "sink", sourcePort: "out", targetPort: "in" },
    ],
  };

  const paused = await runWorkflow(graph, registry, { signal: controller.signal });
  assert.equal(paused.status, "paused");
  assert.equal(paused.checkpoint.pausedNodeId, undefined);
  assert.deepEqual(paused.checkpoint.completedRuns.map((run) => run.nodeId), ["source"]);
  assert.equal(paused.runs.some((run) => run.status === "skipped"), false);

  const resumed = await runWorkflow(graph, registry, { resumeFrom: paused.checkpoint });
  assert.equal(resumed.status, "success");
  assert.equal(calls.get("source"), 1, "completed upstream work must not replay");
  assert.equal(calls.get("blocker"), 2);
  assert.equal(calls.get("sink"), 1);
});
