import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const canvasView = readFileSync(resolve(root, "src/features/canvas/CanvasView.tsx"), "utf8");
const fluxNode = readFileSync(resolve(root, "src/features/canvas/FluxNode.tsx"), "utf8");
const api = readFileSync(resolve(root, "src/lib/api.ts"), "utf8");

const requirements = [
  [
    "canvas store exposes running state and top-bar progress",
    /testing:\s*boolean[\s\S]*runProgress:\s*CanvasRunProgress \| null[\s\S]*setTesting:\s*\(testing: boolean\) => void[\s\S]*setRunProgress:\s*\(runProgress: CanvasRunProgress \| null\) => void/,
    canvasStore,
  ],
  [
    "title bar exposes the single canvas execution action",
    /const workflowCommands = useWorkflowCommands\(\)[\s\S]*label:\s*testing \? "工作流执行中" : "执行工作流"[\s\S]*aria-label=\{testing \? "工作流执行中" : "执行工作流"\}[\s\S]*workflowCommands\.testRun\(\)/,
    titleBar,
  ],
  [
    "API client can start draft test-runs without publishing",
    /test:\s*\(workflowId: string, inputs: ExecutionNodeInputs = \{\}\) =>[\s\S]*request<\{ executionId: string; status: string \}>\("\/executions\/test"[\s\S]*body: JSON\.stringify\(\{ workflowId, inputs \}\)/,
    api,
  ],
  [
    "API client polls draft test-runs through a dedicated helper",
    /async function waitForExecution\([\s\S]*onProgress\?\.\(detail\)[\s\S]*TERMINAL\.includes\(detail\.status\)[\s\S]*export async function runDraftExecution\([\s\S]*executionApi\.test\(workflowId, inputs\)[\s\S]*return waitForExecution\(executionId,\s*onProgress\)/,
    api,
  ],
  [
    "API client can approve a paused human-review execution and continue polling",
    /approve:\s*\([\s\S]*decision:\s*"approved" \| "rejected"[\s\S]*`\/executions\/\$\{id\}\/approval`[\s\S]*export async function approveExecutionAndContinue\([\s\S]*await executionApi\.approve\(executionId,\s*input\)[\s\S]*return waitForExecution\(executionId,\s*onProgress\)/,
    api,
  ],
  [
    "canvas registers test run handling for the title bar",
    /useRegisterWorkflowCommands\(\{[\s\S]*testRun: onTestRun/,
    canvasView,
  ],
  [
    "canvas test run saves the current graph before running the draft workflow",
    /const executeDraftRun = useCallback[\s\S]*await save\(graphSignature\(nodes,\s*edges,\s*workflowTitle,\s*groups\)\)[\s\S]*runDraftExecution\(id, inputs,/,
    canvasView,
  ],
  [
    "canvas derives run progress for the shared title-bar status",
    /const canvasRunProgress = useMemo[\s\S]*completed[\s\S]*total[\s\S]*activeLabel:/,
    canvasView,
  ],
  [
    "title bar renders shared run progress instead of a canvas overlay",
    /const runProgress = useCanvasStore[\s\S]*className="titlebar-run-progress"[\s\S]*role="status"[\s\S]*runProgress\.completed[\s\S]*runProgress\.total/,
    titleBar,
  ],
  [
    "paused human review is injected into and handled on its canvas node",
    (source) =>
      /approvalRun[\s\S]*flux\.business\.humanReview[\s\S]*approvalNodeId/.test(source) &&
      /awaitingApproval[\s\S]*approval:[\s\S]*onDecision:[\s\S]*approvePausedRun/.test(source) &&
      /data\.approval\?\.awaiting[\s\S]*通过[\s\S]*退回/.test(fluxNode),
    canvasView,
  ],
  [
    "canvas progress uses product-facing node type names",
    /activeRun[\s\S]*getNodeTypeName\(activeRun\.type\)/,
    canvasView,
  ],
];

const forbidden = [
  ["canvas test run does not keep a side-window open flag", /testRunOpen|setTestRunOpen/],
  ["canvas test run does not render the old results drawer", /title="运行结果"/],
  ["canvas test run does not render a run log stream side panel", /<LogStream/],
  ["canvas test run does not cover nodes with a floating progress surface", /canvasRunProgress && \([\s\S]*role="status"/],
];

const missing = requirements
  .filter(([, pattern, source]) =>
    typeof pattern === "function" ? !pattern(source) : !pattern.test(source),
  )
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(canvasView))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas test-run requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas test-run pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas test-run contract passed.");
