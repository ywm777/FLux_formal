import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const workflowCommandCoordinator = readFileSync(
  resolve(root, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);

const requirements = [
  [
    "workflow commands keep one explicit top-bar execution action",
    /testRun: \(\) => invoke\("testRun"\)/,
    workflowCommandCoordinator,
  ],
  [
    "workbench transfers the user to the selected canvas without running it",
    /function openWorkflowOnCanvas\(workflowId: string\)[\s\S]*requestOpenWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)/,
    workbenchView,
  ],
  [
    "title bar owns the single workflow execution control",
    /aria-label=\{testing \? "工作流执行中" : "执行工作流"\}[\s\S]*workflowCommands\.testRun\(\)/,
    titleBar,
  ],
  [
    "canvas registers the explicit title-bar execution handler",
    /useRegisterWorkflowCommands\(\{[\s\S]*testRun: onTestRun/,
    canvasView,
  ],
  [
    "execution progress is projected onto canvas nodes",
    /const executeDraftRun = useCallback[\s\S]*applyNodeRunState\(detail\.runs\)/,
    canvasView,
  ],
];

const forbidden = [
  [
    "workbench no longer renders a run result drawer",
    /runPanelOpen|title="运行结果"|<LogStream/,
    workbenchView,
  ],
  [
    "workbench no longer starts execution while remaining on the list",
    /void start\(workflowId\)|requestRunWorkflow|runWorkflow\(/,
    workbenchView,
  ],
  [
    "canvas store no longer carries hidden run-on-open intent",
    /pendingRunWorkflowId|requestRunWorkflow|consumeRunWorkflow/,
    canvasStore,
  ],
  [
    "runtime input nodes no longer duplicate the execution entry",
    /interaction\.onSubmit|submitLabel|开始运行|运行工作流|重新运行/,
    fluxNode,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} workbench run panel requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden run panel pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench-to-canvas run contract passed.");
