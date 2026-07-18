import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const workflowCommandCoordinator = readFileSync(
  resolve(root, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
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
    "workbench opens the selected workflow without starting it",
    /openWorkflowOnCanvas\(workflowId: string\)[\s\S]*requestOpenWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)/,
    workbenchView,
  ],
  [
    "workflow commands expose one explicit execution action",
    /testRun: \(\) => invoke\("testRun"\)/,
    workflowCommandCoordinator,
  ],
  [
    "top-bar runs execute the current canvas and update node state",
    /const executeDraftRun = useCallback[\s\S]*runDraftExecution\(id, inputs,[\s\S]*applyNodeRunState\(detail\.runs\)/,
    canvasView,
  ],
  [
    "fast workflows replay node-by-node instead of jumping to the final state",
    /const playExecutionResult = useCallback[\s\S]*NODE_RUN_STATUS\.RUNNING[\s\S]*window\.setTimeout\(resolve, 420\)[\s\S]*Object\.assign\(visualRun, finalRun\)/,
    canvasView,
  ],
  [
    "execution progress remains visible in the title bar without a side panel",
    /const runProgress = useCanvasStore[\s\S]*className="titlebar-run-progress"[\s\S]*role="status"[\s\S]*runProgress\.completed/,
    titleBar,
  ],
  [
    "delivery nodes expose final output directly on the node card",
    /showRunOutput:\s*deliveryNodeIds\.has\(node\.id\)/,
    canvasView,
  ],
  [
    "node cards render and copy a compact delivery result",
    /shouldShowOutput[\s\S]*d\.showRunOutput[\s\S]*formatInlineOutput\(d\.run\?\.outputs\)[\s\S]*function DeliveryOutput[\s\S]*复制/,
    fluxNode,
  ],
];

const forbidden = [
  [
    "execution output is not rendered in a workbench side drawer",
    /runPanelOpen|title="运行结果"|<LogStream/,
    workbenchView,
  ],
  [
    "workbench cannot enqueue hidden run-on-open behavior",
    /requestRunWorkflow|pendingRunWorkflowId|consumeRunWorkflow/,
    `${workbenchView}\n${canvasStore}\n${canvasView}`,
  ],
  [
    "execution never commands the canvas camera",
    /executionFocusNodeId|ensureNodeVisible|executionFollowSuppressedRef|\.setCenter\(/,
    canvasView,
  ],
  [
    "execution preparation does not move input nodes or force a new zoom level",
    /focusedPosition|RUNTIME_INPUT_DOWNSTREAM_GAP|zoom:\s*0\.95/,
    canvasView,
  ],
  [
    "execution progress does not float over the canvas",
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
  console.error(`Missing ${missing.length} canvas execution-follow requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden execution-follow pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas execution-follow contract passed.");
