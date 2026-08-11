import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const titleBar = readFileSync(
  resolve(root, "src/components/TitleBar.tsx"),
  "utf8",
);
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);

const requirements = [
  [
    "node data can carry a transient visible execution step",
    /executionStep\?: number/,
    fluxNode,
  ],
  [
    "canvas computes node steps with indegree-based graph ordering",
    /function compileCanvasExecutionOrder[\s\S]*indegree\.set\(node\.id,\s*0\)[\s\S]*adjacency\.set\(node\.id,\s*\[\]\)[\s\S]*queue\.shift\(\)/,
    canvasView,
  ],
  [
    "canvas derives a step map from the current nodes and edges",
    /const stepByNodeId = useMemo[\s\S]*compileCanvasExecutionOrder\(nodes,\s*edges\)[\s\S]*new Map\(order\.map\(\(id,\s*index\) => \[id,\s*index \+ 1\]\)\)/,
    canvasView,
  ],
  [
    "rendered nodes receive their visible execution step",
    /executionStep:\s*stepByNodeId\.get\(node\.id\)/,
    canvasView,
  ],
  [
    "node cards render a product-visible step badge",
    /aria-label=\{`执行顺序：第 \$\{d\.executionStep\} 步`\}[\s\S]*title=\{`第 \$\{d\.executionStep\} 步执行`\}[\s\S]*\{d\.executionStep\}/,
    fluxNode,
  ],
  [
    "top bar reports overall execution progress without covering the graph",
    /className="titlebar-run-progress"[\s\S]*role="status"[\s\S]*runProgress\.completed[\s\S]*runProgress\.total/,
    titleBar,
  ],
  [
    "canvas also labels connections with source and target execution steps",
    /const edgesForRender = useMemo<Edge\[\]>\(\(\) => \{[\s\S]*label:[\s\S]*`\$\{sourceStep\} → \$\{targetStep\}`[\s\S]*edges=\{edgesForRender\}/,
    canvasView,
  ],
];

const forbidden = [
  [
    "canvas does not place a floating progress surface over workflow content",
    /canvasRunProgress && \([\s\S]*role="status"/,
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
  console.error(`Missing ${missing.length} execution-order visibility requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden execution-order pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas execution-order visibility contract passed.");
