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
const graphBridge = readFileSync(
  resolve(root, "src/features/canvas/graphBridge.ts"),
  "utf8",
);
const executionController = readFileSync(
  resolve(root, "src/features/canvas/execution/canvasExecutionController.ts"),
  "utf8",
);

const requirements = [
  [
    "node data can carry transient test-run state without changing node config",
    /export interface FluxNodeRunState[\s\S]*status:[\s\S]*outputCount\?: number[\s\S]*error\?: string[\s\S]*run\?: FluxNodeRunState/,
    fluxNode,
  ],
  [
    "node cards always render a compact, accessible process-state indicator",
    /const runLabel[\s\S]*d\.run[\s\S]*"待执行"[\s\S]*aria-label=\{`过程状态：\$\{runLabel\}[\s\S]*runBadgeStyle/,
    fluxNode,
  ],
  [
    "canvas can clear stale run state before a new test run",
    /function clearNodeRunState\([\s\S]*run: undefined/,
    canvasView,
  ],
  [
    "canvas maps execution runs back onto matching nodes",
    /function applyNodeRunState\([\s\S]*new Map\(runs\.map\(\(run\) => \[run\.nodeId,\s*run\]\)\)[\s\S]*run:\s*\{[\s\S]*status:\s*run\.status[\s\S]*outputCount:/,
    canvasView,
  ],
  [
    "draft test-run progress updates the canvas nodes before the overlay rows",
    /this\.ports\.applyNodeRuns\(detail\.runs\)[\s\S]*this\.patch\(\{ detail \}\)/,
    executionController,
  ],
  [
    "final draft test-run result is also reflected on nodes",
    /const result = await this\.ports\.runDraft[\s\S]*this\.ports\.applyNodeRuns\(result\.runs\)[\s\S]*this\.patch\(\{ detail: null, result \}\)/,
    executionController,
  ],
  [
    "a new test run clears node run state before polling starts",
    /this\.ports\.clearNodeRuns\(\)[\s\S]*this\.ports\.initializeNodeRuns\(\)[\s\S]*this\.ports\.setTesting\(true\)/,
    executionController,
  ],
  [
    "duplicated nodes do not inherit transient run state",
    /const duplicate:[\s\S]*run:\s*undefined[\s\S]*actions:\s*undefined/,
    canvasView,
  ],
  [
    "workflow serialization keeps transient run state out of persisted graph data",
    /data:\s*\{ \.\.\.n\.data\.config, \[LABEL_KEY\]: n\.data\.label \}/,
    graphBridge,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} canvas node run-state requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node run-state contract passed.");
