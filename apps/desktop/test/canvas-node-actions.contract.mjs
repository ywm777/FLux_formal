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
    "node cards render a contextual toolbar only for a single active node",
    /const showIndividualControls = selected && d\.multiSelected !== true[\s\S]*NodeToolbar[\s\S]*isVisible=\{showIndividualControls \|\| \(hovered && d\.allowHoverToolbar !== false\)\}[\s\S]*className="canvas-node-toolbar nodrag nopan"/,
    fluxNode,
  ],
  [
    "node toolbar exposes append, advanced settings, duplicate, and delete actions",
    /<ToolbarButton label="追加下游节点"[\s\S]*<ToolbarButton label="高级设置"[\s\S]*<ToolbarButton label="复制节点"[\s\S]*<ToolbarButton label="删除节点"/,
    fluxNode,
  ],
  [
    "node toolbar uses icon-only visible controls",
    /function ToolbarButton[\s\S]*aria-label=\{label\}[\s\S]*<ToolbarIcon name=\{icon\}/,
    fluxNode,
  ],
  [
    "node toolbar stops pointer and click propagation so actions do not reselect the source node",
    /onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}[\s\S]*onClick=\{\(event\) => event\.stopPropagation\(\)\}/,
    fluxNode,
  ],
  [
    "node toolbar actions are passed through node data",
    /interface FluxNodeActions[\s\S]*append:[\s\S]*openSettings:[\s\S]*duplicate:[\s\S]*delete:[\s\S]*updateConfig:[\s\S]*actions\?: FluxNodeActions/,
    fluxNode,
  ],
  [
    "canvas separates selected node state from inspector state",
    /useCanvasSelectionController\(\{ groups \}\)[\s\S]*primaryNodeId: selectedId[\s\S]*inspectingNodeId: inspectingId/,
    canvasView,
  ],
  [
    "single clicking a node selects it without opening the inspector",
    /onNodeClick=\{\(event, node\) => \{[\s\S]*selection\.selectNode\(node\.id\)[\s\S]*setPaletteOpen\(false\)[\s\S]*setPaletteAnchor\(null\)[\s\S]*setMenu\(null\)[\s\S]*\}\}/,
    canvasView,
  ],
  [
    "double clicking a node opens the inspector",
    /onNodeDoubleClick=\{\(_, node\) => \{[\s\S]*selection\.selectNode\(node\.id, \{ inspector: "open" \}\)[\s\S]*\}\}/,
    canvasView,
  ],
  [
    "rendered nodes receive contextual actions without persisting them to the workflow graph",
    /const nodesForRender = useMemo[\s\S]*actions:\s*\{[\s\S]*append:[\s\S]*openSettings:[\s\S]*duplicate:[\s\S]*delete:[\s\S]*updateConfig:/,
    canvasView,
  ],
  [
    "duplicating a node offsets to a collision-safe position and selects the new copy",
    /function cloneConfig[\s\S]*const duplicateNode = useCallback[\s\S]*const duplicatePosition = findOpenNodePosition\([\s\S]*x:\s*source\.position\.x \+ 36[\s\S]*position:\s*duplicatePosition[\s\S]*selection\.selectNode\(copyId\)/,
    canvasView,
  ],
  [
    "deleting a node removes connected edges and closes related inspector state",
    /setEdges\(\(es\) => es\.filter\(\(e\) => e\.source !== id && e\.target !== id\)\);[\s\S]*selection\.removeNodes\(\[id\]\)/,
    canvasView,
  ],
  [
    "node inspector is rendered only for the explicit inspecting node",
    /const inspectingNode = nodes\.find\(\(n\) => n\.id === inspectingId\)[\s\S]*\{inspectingNode && \([\s\S]*node=\{inspectingNode\}/,
    canvasView,
  ],
];

const forbidden = [
  [
    "selected node toolbar does not render a raw configure command",
    /aria-label="配置节点"|>\s*配置\s*<\/button>/,
    fluxNode,
  ],
  [
    "selected node toolbar does not render text labels for common icon actions",
    />\s*(复制|删除)\s*<\/button>/,
    fluxNode,
  ],
  [
    "node action data does not carry the deprecated configure callback",
    /configure:\s*\(\) =>|configure:/,
    canvasView + "\n" + fluxNode,
  ],
  [
    "node context menu does not expose the deprecated configure label",
    /label:\s*"配置节点"/,
    canvasView,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas node action requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} redundant node action pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas contextual node actions contract passed.");
