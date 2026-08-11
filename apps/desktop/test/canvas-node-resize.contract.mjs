import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const readDesktop = (path) => readFileSync(resolve(desktopRoot, path), "utf8");
const readRepo = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const schema = readRepo("packages/workflow-schema/src/schema.ts");
const bridge = readDesktop("src/features/canvas/graphBridge.ts");
const canvas = readDesktop("src/features/canvas/CanvasView.tsx");
const node = readDesktop("src/features/canvas/FluxNode.tsx");

const requirements = [
  [
    "workflow nodes persist an optional window size outside business data",
    /CanvasNodeSchema[\s\S]*size: z\.object\([\s\S]*width: z\.number\(\)\.positive\(\)[\s\S]*height: z\.number\(\)\.positive\(\)[\s\S]*\.optional\(\)/,
    schema,
  ],
  [
    "graph bridge round-trips custom width and height and includes them in the save signature",
    (source) =>
      (source.match(/size: typeof n\.width === "number" && typeof n\.height === "number"/g) ?? []).length >= 2 &&
      /width: n\.size\?\.width[\s\S]*height: n\.size\?\.height/.test(source),
    bridge,
  ],
  [
    "every business node exposes constrained resize handles for single selection",
    /const showIndividualControls = selected && d\.multiSelected !== true[\s\S]*<NodeResizer[\s\S]*isVisible=\{showIndividualControls\}[\s\S]*minWidth=\{NODE_MIN_WIDTH\[presentation\.kind\]\}[\s\S]*minHeight=\{128\}[\s\S]*maxWidth=\{760\}[\s\S]*maxHeight=\{680\}/,
    node,
  ],
  [
    "only user-resized nodes follow explicit dimensions and scroll their own content",
    (source) =>
      /const hasCustomSize = d\.hasCustomSize === true[\s\S]*data-resized=\{hasCustomSize \? "true" : "false"\}/.test(source) &&
      /hasCustomSize \? width : undefined[\s\S]*hasCustomHeight \? height : undefined/.test(source) &&
      /resizableNodeBodyStyle\(hasCustomHeight\)[\s\S]*overflow: "auto"/.test(source),
    node,
  ],
  [
    "resized delivery nodes use available height for scrollable output",
    /fillAvailable: hasCustomHeight[\s\S]*deliveryOutputFillStyle[\s\S]*gridTemplateRows: "auto minmax\(0, 1fr\)"[\s\S]*height: fillAvailable \? "100%"/,
    node,
  ],
  [
    "quick actions appear on the single active node and include size reset",
    (source) =>
      /onMouseEnter=\{\(\) => setHovered\(true\)\}/.test(source) &&
      /isVisible=\{showIndividualControls \|\| \(hovered && d\.allowHoverToolbar !== false\)\}/.test(source) &&
      /label="追加下游节点"[\s\S]*label="高级设置"[\s\S]*label="恢复默认尺寸"[\s\S]*label="复制节点"[\s\S]*label="删除节点"/.test(source),
    node,
  ],
  [
    "canvas suppresses hover toolbars while another node or edge is selected",
    /allowHoverToolbar:[\s\S]*selectedNodeIds\.length === 0 && selectedEdgeId === null[\s\S]*selectedNodeIds\.length === 1 && selectedNodeIdSet\.has\(node\.id\)/,
    canvas,
  ],
  [
    "resize history is recorded once at resize start and default size can be restored",
    (source) =>
      /const resetNodeSize = useCallback[\s\S]*recordHistory\(\)[\s\S]*width: _width[\s\S]*height: _height/.test(source) &&
      /beginResize: recordHistory[\s\S]*resetSize: \(\) => resetNodeSize\(node\.id\)/.test(source),
    canvas,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => (
    typeof pattern === "function" ? !pattern(source) : !pattern.test(source)
  ))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} node-resize requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node resize contract passed.");
