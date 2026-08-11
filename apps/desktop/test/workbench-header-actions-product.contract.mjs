import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

const refreshButtonSource =
  workbenchView.match(
    /<button[\s\S]*aria-label="刷新工作流"[\s\S]*?<\/button>/,
  )?.[0] ?? "";
const refreshButtonStyleSource =
  workbenchView.match(
    /const refreshButton: React\.CSSProperties = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";

const requirements = [
  [
    "workbench keeps new workflow as the visible primary creation command",
    /aria-label="新建工作流"[\s\S]*style=\{newWorkflowButton\}[\s\S]*>\s*新建工作流\s*<\/button>/,
    workbenchView,
  ],
  [
    "refresh workflows is an icon-only utility action",
    /aria-label="刷新工作流"[\s\S]*title="刷新工作流"[\s\S]*style=\{refreshButton\}[\s\S]*<svg[\s\S]*aria-hidden="true"/,
    refreshButtonSource,
  ],
  [
    "refresh button has stable square dimensions",
    /width:\s*32[\s\S]*height:\s*32[\s\S]*justifyContent:\s*"center"/,
    refreshButtonStyleSource,
  ],
];

const forbidden = [
  [
    "refresh button does not add another visible text command",
    />\s*刷新\s*<\/button>/,
    refreshButtonSource,
  ],
  [
    "refresh button does not use text-button horizontal padding",
    /padding:\s*"0 var\(--space-3\)"/,
    refreshButtonStyleSource,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} workbench header-action product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden workbench header-action pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench header actions product contract passed.");
