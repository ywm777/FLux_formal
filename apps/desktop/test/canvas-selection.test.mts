import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasSelectionReducer,
  createEmptyCanvasSelection,
} from "../src/features/canvas/selection/canvasSelection.ts";

test("flow node selection is unique and keeps only a fully retained group", () => {
  const selectedGroup = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-group",
    groupId: "group-1",
    nodeIds: ["a", "b"],
  });
  const retained = canvasSelectionReducer(selectedGroup, {
    type: "sync-flow-selection",
    nodeIds: ["b", "a", "a"],
    edgeId: null,
    lockedEdgeId: null,
    retainedGroupId: "group-1",
  });
  assert.deepEqual(retained.nodeIds, ["b", "a"]);
  assert.equal(retained.primaryNodeId, null);
  assert.equal(retained.groupId, "group-1");

  const partial = canvasSelectionReducer(retained, {
    type: "sync-flow-selection",
    nodeIds: ["a"],
    edgeId: null,
    lockedEdgeId: null,
    retainedGroupId: null,
  });
  assert.deepEqual(partial.nodeIds, ["a"]);
  assert.equal(partial.primaryNodeId, "a");
  assert.equal(partial.groupId, null);
});

test("a locked connection edge wins over a simultaneous node selection", () => {
  const state = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "sync-flow-selection",
    nodeIds: ["a", "b"],
    edgeId: null,
    lockedEdgeId: "edge-1",
    retainedGroupId: null,
  });
  assert.deepEqual(state.nodeIds, []);
  assert.equal(state.primaryNodeId, null);
  assert.equal(state.edgeId, "edge-1");
});

test("node, group, and edge selection are mutually exclusive", () => {
  const node = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-node",
    nodeId: "a",
    mode: "replace",
    inspector: "open",
  });
  assert.deepEqual(node.nodeIds, ["a"]);
  assert.equal(node.inspectingNodeId, "a");

  const edge = canvasSelectionReducer(node, {
    type: "select-edge",
    edgeId: "edge-1",
    inspector: "close",
  });
  assert.deepEqual(edge.nodeIds, []);
  assert.equal(edge.groupId, null);
  assert.equal(edge.edgeId, "edge-1");
  assert.equal(edge.inspectingNodeId, null);

  const group = canvasSelectionReducer(edge, {
    type: "select-group",
    groupId: "group-1",
    nodeIds: ["a", "b"],
  });
  assert.deepEqual(group.nodeIds, ["a", "b"]);
  assert.equal(group.edgeId, null);
  assert.equal(group.groupId, "group-1");
});

test("modified node click leaves React Flow in charge of the node set", () => {
  const multi = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "sync-flow-selection",
    nodeIds: ["a", "b"],
    edgeId: null,
    lockedEdgeId: null,
    retainedGroupId: null,
  });
  const prepared = canvasSelectionReducer(
    { ...multi, edgeId: "edge-1", inspectingNodeId: "a" },
    { type: "prepare-node-toggle" },
  );
  assert.deepEqual(prepared.nodeIds, ["a", "b"]);
  assert.equal(prepared.edgeId, null);
  assert.equal(prepared.inspectingNodeId, null);
});

test("replacing nodes selects an explicit batch without retaining a group", () => {
  const grouped = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-group",
    groupId: "group-1",
    nodeIds: ["a", "b"],
  });
  const replaced = canvasSelectionReducer(
    { ...grouped, edgeId: "edge-1", inspectingNodeId: "a" },
    { type: "replace-nodes", nodeIds: ["copy-a", "copy-b", "copy-a"] },
  );
  assert.deepEqual(replaced.nodeIds, ["copy-a", "copy-b"]);
  assert.equal(replaced.primaryNodeId, null);
  assert.equal(replaced.groupId, null);
  assert.equal(replaced.edgeId, null);
  assert.equal(replaced.inspectingNodeId, null);
});

test("removing nodes also removes stale primary and inspector targets", () => {
  const selected = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-node",
    nodeId: "a",
    mode: "replace",
    inspector: "open",
  });
  const removed = canvasSelectionReducer(selected, {
    type: "remove-nodes",
    nodeIds: ["a"],
  });
  assert.deepEqual(removed.nodeIds, []);
  assert.equal(removed.primaryNodeId, null);
  assert.equal(removed.groupId, null);
  assert.equal(removed.inspectingNodeId, null);
});

test("closing an inspector does not clear canvas selection", () => {
  const selected = canvasSelectionReducer(createEmptyCanvasSelection(), {
    type: "select-node",
    nodeId: "a",
    mode: "replace",
    inspector: "open",
  });
  const closed = canvasSelectionReducer(selected, { type: "close-inspector" });
  assert.deepEqual(closed.nodeIds, ["a"]);
  assert.equal(closed.primaryNodeId, "a");
  assert.equal(closed.inspectingNodeId, null);
});
