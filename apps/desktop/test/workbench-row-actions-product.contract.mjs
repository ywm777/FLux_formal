import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

const requirements = [
  [
    "workflow rows expose opening as their only explicit action",
    /<Button[\s\S]*variant="ghost"[\s\S]*onClick=\{\(\) => openWorkflowOnCanvas\(workflow\.id\)\}[\s\S]*>\s*打开\s*<\/Button>/,
  ],
  [
    "workflow row body opens the exact workflow on the canvas",
    /function openWorkflowOnCanvas\(workflowId: string\)[\s\S]*workflowCommands\.openWorkflow\(workflowId\)[\s\S]*setMode\("canvas"\)[\s\S]*aria-label=\{`打开 \$\{workflow\.title\}`\}[\s\S]*openWorkflowOnCanvas\(workflow\.id\)/,
  ],
  [
    "favorite toggle has workflow-specific accessible copy and pressed state",
    /const favoriteLabel = workflow\.isFavorite[\s\S]*`取消收藏 \$\{workflow\.title\}`[\s\S]*`收藏 \$\{workflow\.title\}`[\s\S]*aria-label=\{favoriteLabel\}[\s\S]*aria-pressed=\{workflow\.isFavorite\}[\s\S]*title=\{favoriteLabel\}/,
  ],
  [
    "favorite toggle uses a product-grade svg icon instead of text symbols",
    /style=\{favoriteButton\}[\s\S]*<svg[\s\S]*aria-hidden="true"[\s\S]*fill=\{workflow\.isFavorite \? "currentColor" : "none"\}[\s\S]*<\/svg>/,
  ],
];

const forbidden = [
  [
    "published workflow rows do not repeat the visible open-canvas label",
    /style=\{openWorkflowButton\}[\s\S]*>\s*打开画布\s*<\/button>/,
  ],
  [
    "published workflow rows no longer carry the old open workflow button style",
    /const openWorkflowButton: React\.CSSProperties/,
  ],
  [
    "workflow rows do not repeat opening with a redundant edit action",
    /编辑工作流|editWorkflowButton|aria-label=\{`编辑 \$\{workflow\.title\}`\}/,
  ],
  [
    "workflow rows never start execution",
    /requestRunWorkflow|runWorkflow\(|>\s*开始\s*</,
  ],
  [
    "favorite toggle does not rely on generic tooltip-only copy",
    /title=\{workflow\.isFavorite \? "取消收藏" : "收藏"\}/,
  ],
  [
    "favorite toggle does not use structural text stars",
    /[★☆]/,
  ],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(workbenchView))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(workbenchView))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} workbench row-action product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden workbench row-action pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench row actions product contract passed.");
