import assert from "node:assert/strict";
import test from "node:test";
import { NodeRegistry, defineNode } from "@flux/node-sdk";
import { MAX_NODE_OUTPUT_BYTES, runWorkflow } from "../dist/index.js";

function graphFor(type) {
  return {
    schemaVersion: 2,
    id: `graph-${type}`,
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    meta: { title: type, tags: [] },
    nodes: [{
      id: "node",
      type,
      position: { x: 0, y: 0 },
      data: {},
      ports: {
        inputs: [],
        outputs: [{ id: "out", name: "Output", dataType: "any", capacity: "many" }],
      },
    }],
    edges: [],
  };
}

function registryFor(type, execute) {
  const registry = new NodeRegistry();
  registry.register(defineNode({
    id: type,
    name: type,
    category: "test",
    icon: "test",
    version: "1.0.0",
    carrier: "basic",
    ports: { inputs: [], outputs: [{ id: "out", name: "Output" }] },
    configSchema: { type: "object" },
    execute,
  }));
  return registry;
}

test("runtime rejects outputs on undeclared ports", async () => {
  const type = "test.undeclared-output";
  const result = await runWorkflow(
    graphFor(type),
    registryFor(type, async () => ({ outputs: { other: true } })),
  );
  assert.equal(result.status, "failed");
  assert.match(result.runs[0].error, /未声明的输出端口/);
});

test("runtime rejects values that cannot survive JSON persistence", async () => {
  const type = "test.invalid-output";
  const result = await runWorkflow(
    graphFor(type),
    registryFor(type, async () => ({ outputs: { out: undefined } })),
  );
  assert.equal(result.status, "failed");
  assert.match(result.runs[0].error, /无法持久化/);
});

test("runtime normalizes optional nested fields to their persisted JSON shape", async () => {
  const type = "test.optional-output";
  const result = await runWorkflow(
    graphFor(type),
    registryFor(type, async () => ({
      outputs: { out: { required: true, optional: undefined } },
    })),
  );
  assert.equal(result.status, "success");
  assert.deepEqual(result.runs[0].outputs, { out: { required: true } });
});

test("runtime rejects oversized node outputs before checkpoint persistence", async () => {
  const type = "test.oversized-output";
  const result = await runWorkflow(
    graphFor(type),
    registryFor(type, async () => ({
      outputs: { out: "x".repeat(MAX_NODE_OUTPUT_BYTES + 1) },
    })),
  );
  assert.equal(result.status, "failed");
  assert.match(result.runs[0].error, /字节上限/);
});
