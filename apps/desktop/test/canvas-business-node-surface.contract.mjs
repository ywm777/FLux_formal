import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const presentation = readFileSync(
  resolve(root, "src/features/canvas/nodeBusinessSurface.ts"),
  "utf8",
);
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const inspector = readFileSync(
  resolve(root, "src/features/canvas/NodeInspector.tsx"),
  "utf8",
);
const singleClickSource =
  canvasView.match(/onNodeClick=\{\(_, node\) => \{[\s\S]*?\}\}[\s\S]*?onNodeDoubleClick=/)?.[0] ?? "";

const requirements = [
  [
    "node presentation has explicit business roles instead of one fixed card type",
    /NodeBusinessKind[\s\S]*"runtime-input"[\s\S]*"source"[\s\S]*"decision"[\s\S]*"approval"[\s\S]*"output"[\s\S]*"action"/,
    presentation,
  ],
  [
    "business roles derive from runtime input, approval, branching, output, and action semantics",
    /resolveNodeBusinessKind[\s\S]*runtimeInputSchema[\s\S]*flux\.business\.humanReview[\s\S]*ports\.outputs\.length > 1[\s\S]*flux\.output\.[\s\S]*ACTION_TYPES/,
    presentation,
  ],
  [
    "connection topology never changes a node's visual business role",
    (source) =>
      /buildNodeBusinessPresentation\(\s*definition: NodeDefinition,?\s*\)/.test(source) &&
      !/isDelivery/.test(source),
    presentation,
  ],
  [
    "node dimensions are stable but adapt to the business role",
    /NODE_WIDTH: Record<NodeBusinessKind, number>[\s\S]*width: NODE_WIDTH\[kind\]/,
    fluxNode,
  ],
  [
    "source nodes can edit business payloads directly on the node",
    /presentation\.kind === "source"[\s\S]*payloadOpen[\s\S]*<textarea[\s\S]*updateConfig\(payload\.key, event\.target\.value\)/,
    fluxNode,
  ],
  [
    "decision nodes show named branch exits and the selected path",
    /presentation\.kind === "decision"[\s\S]*<BranchPorts[\s\S]*activeOutputs[\s\S]*已选择/,
    fluxNode,
  ],
  [
    "human approval decisions execute directly on the approval node",
    /presentation\.kind === "approval"[\s\S]*data\.approval\?\.awaiting[\s\S]*onDecision\("approved"\)[\s\S]*onDecision\("rejected"\)/,
    fluxNode,
  ],
  [
    "output nodes render and copy their delivery content inline",
    (source) =>
      /navigator\.clipboard\.writeText\(inlineOutput\)/.test(source) &&
      /presentation\.kind === "output"[\s\S]*<DeliveryOutput/.test(source),
    fluxNode,
  ],
  [
    "nodes own their wheel interaction while scrollable output remains independently scrollable",
    (source) =>
      /className="flux-business-node nowheel"/.test(source) &&
      /function DeliveryOutput[\s\S]*className="nodrag nopan nowheel"[\s\S]*aria-label="节点输出内容"[\s\S]*tabIndex=\{0\}/.test(source) &&
      /overscrollBehavior: "contain"[\s\S]*scrollbarGutter: "stable"/.test(source),
    fluxNode,
  ],
  [
    "canvas explicitly honors the node wheel boundary",
    /noWheelClassName="nowheel"/,
    canvasView,
  ],
  [
    "canvas injects transient business presentation and controls without persistence",
    /buildNodeBusinessPresentation[\s\S]*presentation:[\s\S]*runtimeInput:[\s\S]*approval:[\s\S]*actions:/,
    canvasView,
  ],
  [
    "advanced settings are explicit overlay configuration rather than the primary business surface",
    /title="高级设置"[\s\S]*variant="overlay"/,
    inspector,
  ],
];

const forbidden = [
  [
    "single click does not automatically open advanced settings",
    /setInspectingId\(node\.id\)/,
    singleClickSource,
  ],
  [
    "runtime input does not return to the advanced settings drawer",
    /runtimeInput|本次运行输入/,
    inspector,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) =>
    typeof pattern === "function" ? !pattern(source) : !pattern.test(source),
  )
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} business node-surface requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden business node-surface pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas business node-surface contract passed.");
