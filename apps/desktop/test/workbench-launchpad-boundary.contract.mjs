import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");

const requirements = [
  [
    "workbench exposes a new-workflow launch action",
    /function createWorkflow\(\)[\s\S]*workflowCommands\.createDraft\(\{ title: "未命名工作流" \}\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label="新建工作流"[\s\S]*onClick=\{createWorkflow\}/,
    workbenchView,
  ],
  [
    "workbench exposes workflow opening without execution",
    /<h2 style=\{sectionTitle\}>工作流<\/h2>[\s\S]*openWorkflowOnCanvas\(workflow\.id\)/,
    workbenchView,
  ],
  [
    "workbench can open a workflow on the canvas",
    /function openWorkflowOnCanvas\(workflowId: string\)[\s\S]*workflowCommands\.openWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label=\{`打开 \$\{workflow\.title\}`\}[\s\S]*openWorkflowOnCanvas\(workflow\.id\)/,
    workbenchView,
  ],
  [
    "canvas publish stays in the canvas title bar instead of the workbench",
    /mode === "canvas"[\s\S]*workflowCommands\.publish\(\)[\s\S]*发布/,
    titleBar,
  ],
  [
    "empty workflow list points users to the canvas instead of publishing from the workbench",
    /workflowListEmpty[\s\S]*暂无工作流[\s\S]*打开画布/,
    workbenchView,
  ],
];

const forbidden = [
  [
    "workbench does not render a current-canvas editor section",
    /currentCanvasSection|当前画布|工作流名称|titleInput|canvasMeta/,
    workbenchView,
  ],
  [
    "workbench does not publish the current canvas",
    /publishCurrentCanvas|发布当前画布|publishCanvasButton/,
    workbenchView,
  ],
  [
    "workbench does not own canvas save or publish state",
    /setCanvasTitle|setCanvasStatus|setCanvasPublishing|applyCanvasRecord|workflowStatus|publishingCanvas|hydratingCanvas|canvasStatus/,
    workbenchView,
  ],
  [
    "workbench does not own workflow execution",
    /requestRunWorkflow|runWorkflow\(|>\s*开始\s*</,
    workbenchView,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} workbench launchpad requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden workbench boundary pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench launchpad boundary contract passed.");
