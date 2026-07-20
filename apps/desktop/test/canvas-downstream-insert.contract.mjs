import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);

const requirements = [
  [
    "node actions include a selected-node append command",
    /interface FluxNodeActions[\s\S]*append:[\s\S]*duplicate:[\s\S]*delete:/,
    fluxNode,
  ],
  [
    "selected node toolbar exposes a compact icon-only downstream append button",
    /<ToolbarButton label="追加下游节点"[\s\S]*icon="append"[\s\S]*function ToolbarIcon[\s\S]*name === "append"[\s\S]*<svg[\s\S]*stroke="currentColor"/,
    fluxNode,
  ],
  [
    "canvas tracks whether the next palette insertion should connect from a source node",
    /const insertSourceId = useRef<string \| null>\(null\)/,
    canvasView,
  ],
  [
    "append palette opens to the right of the selected node and stores the source node",
    /function openNodePaletteForAppend[\s\S]*insertSourceId\.current = sourceId[\s\S]*x:\s*source\.position\.x \+ 280[\s\S]*setPaletteOpen\(true\)/,
    canvasView,
  ],
  [
    "inserting from a stored source creates a connected edge with matching handles",
    /const sourceId = insertSourceId\.current[\s\S]*const source = nodes\.find\(\(n\) => n\.id === sourceId\)[\s\S]*source\?\.data\.outputs\[0\]\?\.id[\s\S]*node\.data\.inputs\[0\]\?\.id[\s\S]*createCanvasHandleId\("source"[\s\S]*createCanvasHandleId\("target"[\s\S]*id:\s*`edge-\$\{sourceId\}-\$\{node\.id\}`/,
    canvasView,
  ],
  [
    "insert source is cleared after a palette selection",
    /insertSourceId\.current = null/,
    canvasView,
  ],
  [
    "A key appends from the selected node before falling back to a centered palette",
    /const addNodeFromKeyboard[\s\S]*if \(selectedId\) \{[\s\S]*openNodePaletteForAppend\(selectedId\)[\s\S]*return;[\s\S]*openNodePaletteAtScreenPoint/,
    canvasView,
  ],
  [
    "rendered nodes receive the append action without persisting actions",
    /actions:\s*\{[\s\S]*append:\s*\(\) => openNodePaletteForAppend\(node\.id\)[\s\S]*openSettings:[\s\S]*duplicate:[\s\S]*delete:/,
    canvasView,
  ],
];

const forbidden = [
  [
    "downstream insert does not require a redundant configure action on node data",
    /configure:/,
    fluxNode + "\n" + canvasView,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} downstream insert requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} redundant downstream action pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas downstream insert contract passed.");
