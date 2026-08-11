import assert from "node:assert/strict";
import test from "node:test";
import {
  allowsAdditionalConnection,
  resolveConnectionStartIntent,
} from "../src/features/canvas/connection/cardinality.ts";

test("an output port fans out to multiple downstream nodes by default", () => {
  assert.equal(allowsAdditionalConnection("many", 1), true);
  assert.equal(allowsAdditionalConnection("many", 3), true);
});

test("an input port still accepts only one upstream node by default", () => {
  assert.deepEqual(resolveConnectionStartIntent({
    kind: "target",
    capacity: "one",
    incidentEdgeCount: 1,
  }), { mode: "blocked", reason: "target-occupied" });
});

test("a many-capacity input accepts multiple upstream nodes", () => {
  assert.deepEqual(resolveConnectionStartIntent({
    kind: "target",
    capacity: "many",
    incidentEdgeCount: 3,
  }), { mode: "create" });
});

test("dragging a used fan-out port creates a branch unless an edge is explicitly selected", () => {
  assert.deepEqual(resolveConnectionStartIntent({
    kind: "source",
    capacity: "many",
    incidentEdgeCount: 1,
  }), { mode: "create" });

  assert.deepEqual(resolveConnectionStartIntent({
    kind: "source",
    capacity: "many",
    incidentEdgeCount: 1,
    selectedIncidentEdge: { edgeId: "source-first", endpoint: "source" },
  }), { mode: "reconnect", edgeId: "source-first", endpoint: "source" });
});

test("an explicitly single-capacity output remains exclusive", () => {
  assert.deepEqual(resolveConnectionStartIntent({
    kind: "source",
    capacity: "one",
    incidentEdgeCount: 1,
  }), { mode: "blocked", reason: "source-occupied" });
});
