import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasStore = readFileSync(resolve(root, "src/store/canvasStore.ts"), "utf8");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const canvasSession = readFileSync(
  resolve(root, "src/features/canvas/session/useCanvasSession.ts"),
  "utf8",
);
const workflowSession = readFileSync(
  resolve(root, "src/features/workspace/application/workflowSessionService.ts"),
  "utf8",
);
const workflowCommands = readFileSync(
  resolve(root, "src/app/workflowCommandCoordinator.ts"),
  "utf8",
);

const requirements = [
  [
    "workflow coordinator exposes a typed open-workflow command",
    /openWorkflow: \(workflowId: string\) => Promise<void>[\s\S]*openWorkflow: \(workflowId\) =>[\s\S]*handlers\.openWorkflow\(workflowId\)/,
    workflowCommands,
  ],
  [
    "workflow coordinator queues navigation until a canvas registers",
    /pendingNavigation[\s\S]*function navigate[\s\S]*register\(handlers\)[\s\S]*queued\.execute\(handlers\)/,
    workflowCommands,
  ],
  [
    "workbench row body opens a specific workflow on the canvas",
    /const workflowCommands = useWorkflowCommands\(\)[\s\S]*function openWorkflowOnCanvas\(workflowId: string\)[\s\S]*workflowCommands\.openWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label=\{`打开 \$\{workflow\.title\}`\}[\s\S]*openWorkflowOnCanvas\(workflow\.id\)/,
    workbenchView,
  ],
  [
    "canvas has a reusable loader that applies an exact workflow record to nodes and edges",
    /const applyWorkflowRecordToCanvas = useCallback[\s\S]*safeParseGraph\(record\.graph\)[\s\S]*fromWorkflowGraph\(parsed\.data\)[\s\S]*setNodes\(ln\)[\s\S]*setEdges\(le\)[\s\S]*applyRecord\(record\)/,
    canvasView,
  ],
  [
    "initial canvas hydration restores the latest workflow",
    /latestWorkflow\(await repository\.list\(\)\)[\s\S]*repository\.get\(latest\.id\)/,
    workflowSession,
  ],
  [
    "canvas session handles explicit open-workflow commands with race protection",
    /const openWorkflow = useCallback[\s\S]*\+\+sessionRequestVersionRef\.current[\s\S]*session\.open\(workflowId\)[\s\S]*acceptRecord\(record\)/,
    canvasSession,
  ],
];

const forbidden = [
  [
    "canvas store does not carry open-workflow commands",
    /openWorkflowId|openWorkflowNonce|requestOpenWorkflow/,
    canvasStore,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} workbench open-workflow requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench open workflow contract passed.");
