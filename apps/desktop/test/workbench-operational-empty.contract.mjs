import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

const bannedCopy = [
  "从这里",
  "这里会显示",
  "选择左侧",
  "运行已发布工作流后",
  "发布画布后",
  "已发布列表为空",
];

const requirements = [
  [
    "workbench has no instructional empty-state copy",
    bannedCopy.every((copy) => !workbenchView.includes(copy)),
  ],
  [
    "empty workflow list is a compact launchpad state",
    /workflowListEmpty[\s\S]*暂无工作流[\s\S]*打开画布/,
  ],
  [
    "workflow open action opens the selected workflow on the canvas",
    /function openWorkflowOnCanvas\(workflowId: string\)[\s\S]*workflowCommands\.openWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)/,
  ],
  [
    "workbench does not keep execution output in a side panel",
    !/runPanelOpen|title="运行结果"|<LogStream|display\.runs\.map/.test(workbenchView),
  ],
  [
    "default workbench has no permanent execution summary components",
    !/EmptyExecutionState|EmptyRunSummary|执行详情|最近运行|summaryStats|sidePanel/.test(workbenchView),
  ],
];

const missing = requirements
  .filter(([, pattern]) => {
    if (typeof pattern === "boolean") return !pattern;
    return !pattern.test(workbenchView);
  })
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} operational empty-state requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench operational empty-state contract passed.");
