import assert from "node:assert/strict";
import test from "node:test";
import {
  CURRENT_WORKFLOW_SCHEMA_VERSION,
  parseGraph,
  safeParseGraph,
} from "../dist/index.js";

function legacyGraph() {
  return {
    id: "legacy-workflow",
    version: 7,
    viewport: { x: 12, y: -8, zoom: 1.25 },
    nodes: [
      {
        id: "source",
        type: "flux.text.constant",
        position: { x: 40, y: 80 },
        data: { text: "hello" },
        ports: {
          inputs: [{ id: "in", name: "上游", dataType: "string" }],
          outputs: [{ id: "out", name: "文本", dataType: "string" }],
        },
      },
    ],
    edges: [],
    meta: { title: "旧格式", tags: ["legacy"] },
  };
}

test("unversioned workflow graphs migrate to the current schema without mutation", () => {
  const source = legacyGraph();
  const before = structuredClone(source);

  const migrated = parseGraph(source);

  assert.equal(migrated.schemaVersion, CURRENT_WORKFLOW_SCHEMA_VERSION);
  assert.equal(migrated.version, 7, "graph revision must remain independent");
  assert.deepEqual(source, before);
  assert.equal("schemaVersion" in source, false);
  assert.equal(migrated.nodes[0].ports.inputs[0].capacity, "one");
  assert.equal(migrated.nodes[0].ports.outputs[0].capacity, "many");
});

test("v1 output cardinality migrates from the legacy single-edge default to fan-out", () => {
  const source = {
    ...legacyGraph(),
    schemaVersion: 1,
    nodes: legacyGraph().nodes.map((node) => ({
      ...node,
      ports: {
        inputs: node.ports.inputs.map((port) => ({ ...port, capacity: "one" })),
        outputs: node.ports.outputs.map((port) => ({ ...port, capacity: "one" })),
      },
    })),
  };
  const before = structuredClone(source);

  const migrated = parseGraph(source);

  assert.equal(migrated.schemaVersion, CURRENT_WORKFLOW_SCHEMA_VERSION);
  assert.equal(migrated.nodes[0].ports.inputs[0].capacity, "one");
  assert.equal(migrated.nodes[0].ports.outputs[0].capacity, "many");
  assert.deepEqual(source, before);
});

test("parsing a current graph is idempotent", () => {
  const current = parseGraph(legacyGraph());

  assert.deepEqual(parseGraph(current), current);
});

test("future workflow schema versions fail instead of being silently coerced", () => {
  const future = {
    ...legacyGraph(),
    schemaVersion: CURRENT_WORKFLOW_SCHEMA_VERSION + 1,
  };

  const result = safeParseGraph(future);

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.error.message, /版本|version/i);
  }
});
