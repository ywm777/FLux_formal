import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

const requirements = [
  [
    "workbench list is labeled as filtered flow inventory instead of publish state",
    /FLOW_FILTER_LABEL[\s\S]*all:\s*"全部流程"[\s\S]*<h2 style=\{sectionTitle\}>\{FLOW_FILTER_LABEL\[flowFilter\]\}<\/h2>/,
  ],
  [
    "workflow rows describe update time in user-facing copy",
    /<span style=\{rowMeta\}>\s*更新于 \{formatDate\(workflow\.updatedAt\)\}\s*<\/span>/,
  ],
  [
    "workflow rows still use updatedAt as the displayed recency signal",
    /formatDate\(workflow\.updatedAt\)/,
  ],
];

const forbidden = [
  [
    "workbench list does not imply published-only state",
    /已发布工作流|已发布列表为空|刷新已发布工作流|可执行工作流/,
  ],
  [
    "workbench does not expose workflow version numbers in the published list",
    /workflow\.version|v\{workflow\.version\}/,
  ],
  [
    "workbench does not prefix published workflow metadata with an engineering version label",
    />\s*v\{/,
  ],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(workbenchView))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(workbenchView))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} workbench list product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden workbench list pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench list product contract passed.");
