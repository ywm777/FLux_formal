import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const handles = read("apps/desktop/src/features/canvas/canvasHandles.ts");
const fluxNode = read("apps/desktop/src/features/canvas/FluxNode.tsx");
const graphBridge = read("apps/desktop/src/features/canvas/graphBridge.ts");
const schema = read("packages/workflow-schema/src/schema.ts");

const requirements = [
  [
    "visual handle ids preserve logical kind, port, and side",
    /createCanvasHandleId[\s\S]*CanvasHandleKind[\s\S]*CanvasHandleAnchor[\s\S]*encodeURIComponent\(portId\)[\s\S]*parseCanvasHandleId/,
    handles,
  ],
  [
    "ordinary nodes expose incoming and outgoing handles on every side",
    /inputAnchors[\s\S]*return ALL_ANCHORS[\s\S]*outputAnchors[\s\S]*return ALL_ANCHORS/,
    fluxNode,
  ],
  [
    "source-only and sink-only nodes retain their available direction on every side",
    /inputCount === 0[\s\S]*return ALL_ANCHORS[\s\S]*outputCount === 0[\s\S]*return ALL_ANCHORS/,
    fluxNode,
  ],
  [
    "branch nodes retain semantic handles and gain top and left outputs",
    (source) =>
      /createCanvasHandleId\("source", port\.id, "right"\)/.test(source) &&
      /createCanvasHandleId\("source", port\.id, "bottom"\)/.test(source) &&
      /BRANCH_EXTRA_OUTPUT_ANCHORS[\s\S]*\["top", "left"\]/.test(source),
    fluxNode,
  ],
  [
    "workflow schema persists visual anchors separately from logical ports",
    /CanvasAnchorSchema[\s\S]*sourceAnchor: CanvasAnchorSchema\.optional\(\)[\s\S]*targetAnchor: CanvasAnchorSchema\.optional\(\)/,
    schema,
  ],
  [
    "graph bridge decodes handles when saving and reconstructs them when loading",
    /parseCanvasHandleId\(e\.sourceHandle\)[\s\S]*sourceAnchor: sourceHandle\?\.anchor[\s\S]*createCanvasHandleId\("source", sourcePort, sourceAnchor\)/,
    graphBridge,
  ],
];

const missing = requirements
  .filter(([, check, source]) => typeof check === "function" ? !check(source) : !check.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} four-side connection requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas four-side connection contract passed.");
