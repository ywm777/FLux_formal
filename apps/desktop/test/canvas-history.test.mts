import assert from "node:assert/strict";
import test from "node:test";
import {
  commitCanvasHistory,
  createCanvasHistory,
  redoCanvasHistory,
  resetCanvasHistory,
  undoCanvasHistory,
} from "../src/features/canvas/history/canvasHistory.ts";

test("commit moves present to past and clears future", () => {
  const initial = createCanvasHistory("a", 3);
  const edited = commitCanvasHistory(initial, "b");
  const undone = undoCanvasHistory(edited);
  const branched = commitCanvasHistory(undone, "c");
  assert.deepEqual(branched, {
    past: ["a"],
    present: "c",
    future: [],
    limit: 3,
  });
});

test("undo and redo move through past present and future", () => {
  const history = commitCanvasHistory(
    commitCanvasHistory(createCanvasHistory(1), 2),
    3,
  );
  const undone = undoCanvasHistory(history);
  assert.deepEqual(undone, {
    past: [1],
    present: 2,
    future: [3],
    limit: 80,
  });
  assert.deepEqual(redoCanvasHistory(undone), history);
});

test("history depth is bounded without losing the current value", () => {
  let history = createCanvasHistory(0, 2);
  history = commitCanvasHistory(history, 1);
  history = commitCanvasHistory(history, 2);
  history = commitCanvasHistory(history, 3);
  assert.deepEqual(history, {
    past: [1, 2],
    present: 3,
    future: [],
    limit: 2,
  });
});

test("undo and redo at a boundary are stable", () => {
  const history = createCanvasHistory("only");
  assert.strictEqual(undoCanvasHistory(history), history);
  assert.strictEqual(redoCanvasHistory(history), history);
});

test("reset replaces the complete timeline", () => {
  const history = commitCanvasHistory(createCanvasHistory("a"), "b");
  assert.deepEqual(resetCanvasHistory(history, "fresh"), {
    past: [],
    present: "fresh",
    future: [],
    limit: 80,
  });
});
