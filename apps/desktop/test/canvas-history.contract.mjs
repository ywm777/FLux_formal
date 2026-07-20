import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const historyModel = readFileSync(
  resolve(root, "src/features/canvas/history/canvasHistory.ts"),
  "utf8",
);
const historyController = readFileSync(
  resolve(root, "src/features/canvas/history/useCanvasHistoryController.ts"),
  "utf8",
);
const keyboardController = readFileSync(
  resolve(root, "src/features/canvas/keyboard/useCanvasKeyboardController.ts"),
  "utf8",
);

const requirements = [
  [
    "canvas routes graph history through one controller",
    (source) =>
      /useCanvasHistoryController\(\{/.test(source) &&
      !/undoStackRef|redoStackRef|nodeDragHistoryRef/.test(source),
    canvasView,
  ],
  [
    "history snapshot excludes selection and runtime actions",
    (source) => {
      const snapshotStart = source.indexOf("interface GraphSnapshot");
      const snapshotEnd = source.indexOf("function missingRuntimeInputFields");
      const snapshotShape = source.slice(snapshotStart, snapshotEnd);
      return /nodes: Node<FluxNodeData>\[\][\s\S]*edges: Edge\[\][\s\S]*groups: CanvasGroup\[\]/.test(snapshotShape) &&
        !/selectedId:|selectedNodeIds:|selectedGroupId:/.test(snapshotShape) &&
        /actions:\s*undefined[\s\S]*run:\s*undefined/.test(source);
    },
    canvasView,
  ],
  [
    "mutating graph operations use the controller record boundary",
    /const recordHistory = history\.record[\s\S]*const commitNewConnection[\s\S]*recordHistory\(\)[\s\S]*setEdges\(result\.edges\)[\s\S]*const insertNode[\s\S]*recordHistory\(\)[\s\S]*setNodes/,
    canvasView,
  ],
  [
    "node and group drags use history transactions",
    /onNodeDragStart=\{history\.beginTransaction\}[\s\S]*onNodeDragStop=\{history\.endTransaction\}/,
    canvasView,
  ],
  [
    "group drag begins and ends one history transaction",
    /const beginGroupDrag[\s\S]*history\.beginTransaction\(\)[\s\S]*const endGroupDrag[\s\S]*history\.endTransaction\(\)/,
    canvasView,
  ],
  [
    "undo and redo restore snapshots returned by the controller",
    /const undoGraph[\s\S]*history\.undo\(\)[\s\S]*restoreGraphSnapshot\(snapshot\)[\s\S]*const redoGraph[\s\S]*history\.redo\(\)[\s\S]*restoreGraphSnapshot\(snapshot\)/,
    canvasView,
  ],
  [
    "keyboard shortcuts support undo and redo before selected-node shortcuts",
    /matchesShortcut\(event, "redo"\)[\s\S]*onRedo\(\)[\s\S]*matchesShortcut\(event, "undo"\)[\s\S]*onUndo\(\)[\s\S]*if \(!selectedNodeId\) return;/,
    keyboardController,
  ],
  [
    "the pure history model has no framework import",
    (source) =>
      !/from ["']react["']|from ["']@xyflow\/react["']/.test(source) &&
      /past: T\[\][\s\S]*present: T[\s\S]*future: T\[\]/.test(source),
    historyModel,
  ],
  [
    "the React controller delegates timeline changes to the pure model",
    (source) => [
      "commitCanvasHistory",
      "undoCanvasHistory",
      "redoCanvasHistory",
      "resetCanvasHistory",
    ].every((name) => source.includes(name)),
    historyController,
  ],
];

const missing = requirements
  .filter(([, pattern, source = canvasView]) => (
    typeof pattern === "function" ? !pattern(source) : !pattern.test(source)
  ))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} canvas history requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas undo/redo history contract passed.");
