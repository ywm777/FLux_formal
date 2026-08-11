import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

function constBlock(source, name) {
  const match = new RegExp(`const ${name}: React\\.CSSProperties = \\{[\\s\\S]*?\\n\\};`).exec(source);
  return match?.[0] ?? "";
}

function functionBlock(source, name) {
  const match = new RegExp(`function ${name}\\([^)]*\\): React\\.CSSProperties \\{[\\s\\S]*?\\n\\}`).exec(source);
  return match?.[0] ?? "";
}

const titlebarSubtitleBlock = titleBar.slice(titleBar.indexOf("无界工作流") - 240, titleBar.indexOf("无界工作流") + 240);
const primaryNavButtonBlock = functionBlock(titleBar, "primaryNavButton");
const launchHeaderBlock = constBlock(workbenchView, "launchHeader");
const launchTitleBlockBlock = constBlock(workbenchView, "launchTitleBlock");
const newWorkflowButtonBlock = constBlock(workbenchView, "newWorkflowButton");
const refreshButtonBlock = constBlock(workbenchView, "refreshButton");

const requirements = [
  [
    "titlebar product subtitle cannot wrap in compact windows",
    /whiteSpace:\s*"nowrap"[\s\S]*?flexShrink:\s*0/,
    titlebarSubtitleBlock,
  ],
  [
    "titlebar primary navigation labels cannot split onto multiple lines",
    /whiteSpace:\s*"nowrap"[\s\S]*lineHeight:\s*"22px"/,
    primaryNavButtonBlock,
  ],
  [
    "workbench launch header can wrap actions below the title on narrow windows",
    /flexWrap:\s*"wrap"/,
    launchHeaderBlock,
  ],
  [
    "workbench title block preserves enough width before actions share the row",
    /flex:\s*"1 1 240px"/,
    launchTitleBlockBlock,
  ],
  [
    "workbench primary action label cannot wrap",
    /whiteSpace:\s*"nowrap"/,
    newWorkflowButtonBlock,
  ],
  [
    "workbench refresh utility action cannot resize around text",
    /width:\s*32[\s\S]*height:\s*32[\s\S]*padding:\s*0[\s\S]*flexShrink:\s*0/,
    refreshButtonBlock,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} responsive label-fit requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Responsive label-fit contract passed.");
