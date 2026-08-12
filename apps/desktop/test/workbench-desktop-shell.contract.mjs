import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);
const globalCss = readFileSync(resolve(root, "src/global.css"), "utf8");

function constBlock(source, name) {
  const match = new RegExp(`const ${name}: React\\.CSSProperties = \\{[\\s\\S]*?\\n\\};`).exec(source);
  return match?.[0] ?? "";
}

const frameBlock = constBlock(workbenchView, "frame");
const workflowInfoButtonBlock = constBlock(workbenchView, "workflowInfoButton");
const listHeaderBlock = constBlock(workbenchView, "workflowListHeader");

const requirements = [
  [
    "desktop workbench uses the available window width with an ultrawide readability guard",
    /width:\s*"100%"[\s\S]*maxWidth:\s*1920[\s\S]*boxSizing:\s*"border-box"[\s\S]*padding:\s*"var\(--space-5\) clamp\(var\(--space-4\), 2\.5vw, var\(--space-8\)\)"/,
    frameBlock,
  ],
  [
    "workflow inventory renders a compact desktop list header",
    /<div style=\{workflowListHeader\} aria-hidden="true">[\s\S]*<span>名称<\/span>[\s\S]*<span>运行状态<\/span>[\s\S]*<span>更新<\/span>[\s\S]*<span>操作<\/span>/,
    workbenchView,
  ],
  [
    "workflow row body is a low-chrome button that opens the exact workflow",
    /<button[\s\S]*aria-label=\{`打开 \$\{workflow\.title\}`\}[\s\S]*onClick=\{\(\) => openWorkflowOnCanvas\(workflow\.id\)\}[\s\S]*style=\{workflowInfoButton\}/,
    workbenchView,
  ],
  [
    "workflow row hover and focus feedback uses dark tokens",
    /\.workbench-workflow-row:hover[\s\S]*border-color:\s*var\(--border-strong\)[\s\S]*\.workbench-workflow-row:focus-within[\s\S]*box-shadow:\s*var\(--shadow-node-selected\)/,
    globalCss,
  ],
  [
    "workflow info button keeps text layout stable",
    /minWidth:\s*0[\s\S]*textAlign:\s*"left"[\s\S]*background:\s*"transparent"/,
    workflowInfoButtonBlock,
  ],
  [
    "desktop list header distributes wide space across its information columns",
    /gridTemplateColumns:[\s\S]*"28px minmax\(280px, 1\.5fr\) minmax\(210px, 0\.75fr\) minmax\(140px, 0\.45fr\) 112px"/,
    listHeaderBlock,
  ],
];

const forbidden = [
  [
    "workflow body opening does not restore the old visible row open button",
    /style=\{openWorkflowButton\}[\s\S]*>\s*打开画布\s*<\/button>|const openWorkflowButton: React\.CSSProperties/,
    workbenchView,
  ],
  [
    "workflow row does not render a redundant edit icon",
    /编辑工作流|editWorkflowButton|aria-label=\{`编辑 \$\{workflow\.title\}`\}/,
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
  console.error(`Missing ${missing.length} desktop workbench requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden desktop workbench pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench desktop shell contract passed.");
