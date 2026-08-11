import assert from "node:assert/strict";
import test from "node:test";
import { buildCanvasConnectionIndex } from "../src/features/canvas/canvasRenderIndex.ts";

test("builds connected handles and incoming-node membership in one edge pass", () => {
  const index = buildCanvasConnectionIndex([
    {
      source: "a",
      target: "b",
      sourceHandle: "a-right-out",
      targetHandle: "b-left-in",
    },
    {
      source: "a",
      target: "c",
      sourceHandle: "a-bottom-out",
      targetHandle: "c-top-in",
    },
  ]);

  assert.deepEqual(index.connectedHandlesByNode.get("a"), [
    "a-right-out",
    "a-bottom-out",
  ]);
  assert.deepEqual(index.connectedHandlesByNode.get("b"), ["b-left-in"]);
  assert.equal(index.nodesWithIncomingEdges.has("a"), false);
  assert.equal(index.nodesWithIncomingEdges.has("b"), true);
  assert.equal(index.nodesWithIncomingEdges.has("c"), true);
});
