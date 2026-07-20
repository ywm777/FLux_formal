import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");

const requirements = [
  [
    "node inspector remains hidden until a node interaction selects a target",
    /useCanvasSelectionController\(\{ groups \}\)[\s\S]*inspectingNodeId: inspectingId/,
  ],
  [
    "single-clicking a node only selects it",
    /onNodeClick=\{\(event, node\) => \{[\s\S]*selection\.selectNode\(node\.id\)[\s\S]*setPaletteOpen\(false\)[\s\S]*setPaletteAnchor\(null\)[\s\S]*setMenu\(null\)[\s\S]*\}\}/,
  ],
  [
    "double-clicking a node opens advanced settings",
    /onNodeDoubleClick=\{\(_, node\) => \{[\s\S]*selection\.selectNode\(node\.id, \{ inspector: "open" \}\)[\s\S]*\}\}/,
  ],
  [
    "the selected-node toolbar can explicitly open advanced settings",
    /openSettings:\s*\(\) => openNodeInspector\(node\.id\)/,
  ],
  [
    "clicking the empty canvas hides the inspector again",
    /onPaneClick=\{\(\) => \{[\s\S]*selection\.clearCanvas\(\)[\s\S]*setMenu\(null\)[\s\S]*\}\}/,
  ],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(canvasView))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} canvas node inspector trigger requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node inspector trigger contract passed.");
