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

const requirements = [
  [
    "canvas store keeps a specific workflow-open request instead of relying on latest workflow",
    /openWorkflowId:\s*string \| null[\s\S]*openWorkflowNonce:\s*number[\s\S]*requestOpenWorkflow:\s*\(workflowId: string\) => void/,
    canvasStore,
  ],
  [
    "requestOpenWorkflow records the workflow id and bumps a nonce",
    /requestOpenWorkflow:\s*\(workflowId\) =>\s*set\(\(s\) => \(\{[\s\S]*openWorkflowId:\s*workflowId[\s\S]*openWorkflowNonce:\s*s\.openWorkflowNonce \+ 1/,
    canvasStore,
  ],
  [
    "workbench row body opens a specific workflow on the canvas",
    /const requestOpenWorkflow = useCanvasStore\(\(s\) => s\.requestOpenWorkflow\)[\s\S]*function openWorkflowOnCanvas\(workflowId: string\)[\s\S]*requestOpenWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label=\{`打开 \$\{workflow\.title\}`\}[\s\S]*openWorkflowOnCanvas\(workflow\.id\)/,
    workbenchView,
  ],
  [
    "canvas has a reusable loader that applies an exact workflow record to nodes and edges",
    /const applyWorkflowRecordToCanvas = useCallback[\s\S]*safeParseGraph\(record\.graph\)[\s\S]*fromWorkflowGraph\(parsed\.data\)[\s\S]*setNodes\(ln\)[\s\S]*setEdges\(le\)[\s\S]*applyRecord\(record\)/,
    canvasView,
  ],
  [
    "initial canvas hydration prefers a requested workflow id before falling back to latest",
    /if \(request\.requestedWorkflowId\)[\s\S]*repository\.get\(request\.requestedWorkflowId\)[\s\S]*latestWorkflow\(await repository\.list\(\)\)/,
    workflowSession,
  ],
  [
    "canvas session listens for later open-workflow requests while mounted",
    /const openWorkflowId = useCanvasStore[\s\S]*const openWorkflowNonce = useCanvasStore[\s\S]*seenOpenWorkflowNonce[\s\S]*session[\s\S]*\.open\(openWorkflowId\)[\s\S]*acceptRecord\(record\)/,
    canvasSession,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} workbench open-workflow requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench open workflow contract passed.");
