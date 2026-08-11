import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const canvasView = readFileSync(
  resolve(desktopRoot, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const fluxNode = readFileSync(
  resolve(desktopRoot, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);
const engine = readFileSync(
  resolve(repoRoot, "packages/workflow-runtime/src/runtime.ts"),
  "utf8",
);
const processor = readFileSync(
  resolve(
    repoRoot,
    "apps/api/src/modules/executions/execution-processor.service.ts",
  ),
  "utf8",
);
const executionController = readFileSync(
  resolve(desktopRoot, "src/features/canvas/execution/canvasExecutionController.ts"),
  "utf8",
);

const requirements = [
  [
    "every node has a visible pre-run state",
    /const runLabel = d\.run \? RUN_LABEL\[d\.run\.status\] : "待执行"/,
    fluxNode,
  ],
  [
    "node state uses copy as well as color",
    /className="canvas-node-run-badge"[\s\S]*data-status=\{processStatus\}[\s\S]*aria-label=\{`过程状态：\$\{runLabel\}/,
    fluxNode,
  ],
  [
    "canvas initializes every node as pending immediately after run starts",
    /this\.ports\.clearNodeRuns\(\)[\s\S]*this\.ports\.initializeNodeRuns\(\)[\s\S]*this\.ports\.setTesting\(true\)/,
    executionController,
  ],
  [
    "execution processor persists the pending queue before node execution",
    /for \(const nodeId of order\)[\s\S]*upsertNodeRun\(executionId,[\s\S]*status: NODE_RUN_STATUS\.PENDING/,
    processor,
  ],
  [
    "execution engine emits the running state before invoking the node",
    /options\.onNodeRun\?\.\(\{[\s\S]*status: NODE_RUN_STATUS\.RUNNING[\s\S]*\}\);[\s\S]*await definition\.execute\(context\)/,
    engine,
  ],
  [
    "remaining nodes become skipped after an upstream failure",
    /function|const skipRemaining[\s\S]*status: NODE_RUN_STATUS\.SKIPPED[\s\S]*skipRemaining\(orderIndex\)/,
    engine,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} node process-status requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node process status contract passed.");
