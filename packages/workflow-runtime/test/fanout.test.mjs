import assert from "node:assert/strict";
import test from "node:test";
import { NodeRegistry, defineNode } from "@flux/node-sdk";
import { runWorkflow } from "../dist/index.js";

test("one produced output is delivered to every outgoing edge", async () => {
  const registry = new NodeRegistry();
  const received = new Map();

  registry.register(defineNode({
    id: "test.source",
    name: "Source",
    category: "source",
    icon: "source",
    version: "1.0.0",
    carrier: "basic",
    ports: {
      inputs: [],
      outputs: [{ id: "out", name: "Output", capacity: "many" }],
    },
    configSchema: { type: "object" },
    async execute() {
      return { outputs: { out: { value: "shared" } } };
    },
  }));

  registry.register(defineNode({
    id: "test.sink",
    name: "Sink",
    category: "output",
    icon: "sink",
    version: "1.0.0",
    carrier: "basic",
    ports: {
      inputs: [{ id: "in", name: "Input", capacity: "one" }],
      outputs: [{ id: "out", name: "Output", capacity: "many" }],
    },
    configSchema: { type: "object" },
    async execute(context) {
      received.set(context.nodeId, context.inputs);
      return { outputs: { out: context.inputs } };
    },
  }));

  const graph = {
    schemaVersion: 2,
    id: "fanout",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      {
        id: "source",
        type: "test.source",
        position: { x: 0, y: 0 },
        data: {},
        ports: { inputs: [], outputs: [{ id: "out", name: "Output", dataType: "any", capacity: "many" }] },
      },
      ...["first", "second", "third"].map((id) => ({
        id,
        type: "test.sink",
        position: { x: 100, y: 0 },
        data: {},
        ports: {
          inputs: [{ id: "in", name: "Input", dataType: "any", capacity: "one" }],
          outputs: [{ id: "out", name: "Output", dataType: "any", capacity: "many" }],
        },
      })),
    ],
    edges: ["first", "second", "third"].map((target) => ({
      id: `source-${target}`,
      source: "source",
      target,
      sourcePort: "out",
      targetPort: "in",
    })),
    meta: { title: "Fan-out", tags: [] },
  };

  const result = await runWorkflow(graph, registry);

  assert.equal(result.status, "success");
  assert.deepEqual([...received.keys()].sort(), ["first", "second", "third"]);
  for (const input of received.values()) {
    assert.deepEqual(input, { value: "shared" });
  }
});

test("a many-capacity input receives every upstream value in edge order", async () => {
  const registry = new NodeRegistry();
  let received;

  registry.register(defineNode({
    id: "test.valueSource",
    name: "Value source",
    category: "source",
    icon: "source",
    version: "1.0.0",
    carrier: "basic",
    ports: { inputs: [], outputs: [{ id: "out", name: "Output", capacity: "many" }] },
    configSchema: { type: "object" },
    async execute(context) {
      return { outputs: { out: context.config.value } };
    },
  }));

  registry.register(defineNode({
    id: "test.collector",
    name: "Collector",
    category: "output",
    icon: "sink",
    version: "1.0.0",
    carrier: "basic",
    ports: {
      inputs: [{ id: "in", name: "Items", capacity: "many" }],
      outputs: [{ id: "out", name: "Output", capacity: "many" }],
    },
    configSchema: { type: "object" },
    async execute(context) {
      received = context.inputs;
      return { outputs: { out: context.inputs } };
    },
  }));

  const graph = {
    schemaVersion: 2,
    id: "fanin",
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      ...["first", "second", "third"].map((id, index) => ({
        id,
        type: "test.valueSource",
        position: { x: 0, y: index * 100 },
        data: { value: index + 1 },
        ports: { inputs: [], outputs: [{ id: "out", name: "Output", dataType: "any", capacity: "many" }] },
      })),
      {
        id: "collector",
        type: "test.collector",
        position: { x: 200, y: 100 },
        data: {},
        ports: {
          inputs: [{ id: "in", name: "Items", dataType: "any", capacity: "one" }],
          outputs: [{ id: "out", name: "Output", dataType: "any", capacity: "many" }],
        },
      },
    ],
    edges: ["first", "second", "third"].map((source) => ({
      id: `${source}-collector`,
      source,
      target: "collector",
      sourcePort: "out",
      targetPort: "in",
    })),
    meta: { title: "Fan-in", tags: [] },
  };

  const result = await runWorkflow(graph, registry);

  assert.equal(result.status, "success");
  assert.deepEqual(received, { in: [1, 2, 3] });
});
