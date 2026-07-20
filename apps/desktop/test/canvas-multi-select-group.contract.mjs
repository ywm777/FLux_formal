import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const canvas = readFileSync(resolve(desktopRoot, "src/features/canvas/CanvasView.tsx"), "utf8");
const layer = readFileSync(resolve(desktopRoot, "src/features/canvas/CanvasSelectionLayer.tsx"), "utf8");
const selectionController = readFileSync(
  resolve(desktopRoot, "src/features/canvas/selection/useCanvasSelectionController.ts"),
  "utf8",
);
const selectionModel = readFileSync(
  resolve(desktopRoot, "src/features/canvas/selection/canvasSelection.ts"),
  "utf8",
);
const bridge = readFileSync(resolve(desktopRoot, "src/features/canvas/graphBridge.ts"), "utf8");
const schema = readFileSync(resolve(repoRoot, "packages/workflow-schema/src/schema.ts"), "utf8");
const css = readFileSync(resolve(desktopRoot, "src/global.css"), "utf8");

const requirements = [
  [
    "left-drag selection uses partial intersection while middle and right drag preserve panning",
    /selectionOnDrag[\s\S]*selectionMode=\{SelectionMode\.Partial\}[\s\S]*panOnDrag=\{\[1, 2\]\}[\s\S]*multiSelectionKeyCode=\{\["Control", "Meta", "Shift"\]\}/,
    canvas,
  ],
  [
    "canvas selection is routed through one controller and projected into React Flow nodes",
    (source) =>
      /useCanvasSelectionController\(\{ groups \}\)/.test(source) &&
      /onSelectionChange=\{onCanvasSelectionChange\}/.test(source) &&
      /selected: selectedNodeIdSet\.has\(node\.id\)/.test(source) &&
      !/setSelected(?:Id|NodeIds|GroupId|EdgeId)|setInspectingId/.test(source),
    canvas,
  ],
  [
    "the pure selection policy does not import React or React Flow",
    (source) =>
      !/from ["']react["']|from ["']@xyflow\/react["']/.test(source) &&
      /function canvasSelectionReducer/.test(source),
    selectionModel,
  ],
  [
    "the selection controller retains a group only while all members stay selected",
    /group\.nodeIds\.every[\s\S]*type: "sync-flow-selection"/,
    selectionController,
  ],
  [
    "dragging selected nodes records one history boundary",
    /onNodeDragStart=\{history\.beginTransaction\}[\s\S]*onNodeDragStop=\{history\.endTransaction\}/,
    canvas,
  ],
  [
    "selection toolbar offers group, duplicate, and delete actions",
    /已选 \{selectedNodes\.length\} 个节点[\s\S]*onMergeSelection[\s\S]*组合[\s\S]*onDuplicateSelection[\s\S]*onDeleteSelection/,
    layer,
  ],
  [
    "groups can be selected, dragged as one unit, and ungrouped",
    /onGroupPointerDown[\s\S]*title="拖动整组"[\s\S]*onUngroup\(group\.id\)[\s\S]*const beginGroupDrag[\s\S]*const moveGroup[\s\S]*const endGroupDrag/,
    `${layer}\n${canvas}`,
  ],
  [
    "group metadata is persisted outside executable nodes and included in signatures",
    /CanvasGroupSchema[\s\S]*nodeIds: z\.array\(z\.string\(\)\)\.min\(2\)[\s\S]*groups: z\.array\(CanvasGroupSchema\)\.optional\(\)/,
    schema,
  ],
  [
    "graph bridge round-trips visual groups",
    /toWorkflowGraph[\s\S]*groups: CanvasGroup\[\] = \[\][\s\S]*groups: groups\.map[\s\S]*fromWorkflowGraph[\s\S]*graph\.groups \?\? \[\][\s\S]*return \{ nodes, edges, groups \}[\s\S]*graphSignature[\s\S]*groups: groups\.map/,
    bridge,
  ],
  [
    "selection and group chrome use the shared dark theme tokens",
    /\.react-flow__selection[\s\S]*var\(--accent\)[\s\S]*\.canvas-selection-toolbar[\s\S]*var\(--bg-elevated\)[\s\S]*\.canvas-node-group/,
    css,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => (
    typeof pattern === "function" ? !pattern(source) : !pattern.test(source)
  ))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} canvas multi-selection/group requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas multi-selection and grouping contract passed.");
