import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workbenchView = readFileSync(
  resolve(root, "src/features/workbench/WorkbenchView.tsx"),
  "utf8",
);

function constBlock(source, name) {
  const match = new RegExp(`const ${name}: React\\.CSSProperties = \\{[\\s\\S]*?\\n\\};`).exec(source);
  return match?.[0] ?? "";
}

const launchHeaderBlock = constBlock(workbenchView, "launchHeader");

const requirements = [
  [
    "workbench title is a product surface label, not launch-page copy",
    /<h1 style=\{pageTitle\}>工作台<\/h1>/,
  ],
  [
    "workbench count copy names flow objects directly",
    /`\$\{workflows\.length\} 个流对象`/,
  ],
  [
    "flow inventory keeps a filtered section heading below the page title",
    /<h2 style=\{sectionTitle\}>\{FLOW_FILTER_LABEL\[flowFilter\]\}<\/h2>/,
  ],
  [
    "workbench header keeps responsive wrapping without becoming a card",
    /display:\s*"flex"[\s\S]*flexWrap:\s*"wrap"/,
    launchHeaderBlock,
  ],
];

const forbidden = [
  [
    "workbench no longer says workflow launchpad in the main surface",
    /工作流启动台/,
    workbenchView,
  ],
  [
    "workbench does not render the workflow list as a second page heading",
    /<h1 style=\{pageTitle\}>已发布工作流<\/h1>/,
    workbenchView,
  ],
  [
    "workbench does not imply the list is limited to published workflows",
    /已发布工作流|已发布列表为空|刷新已发布工作流|可执行工作流/,
    workbenchView,
  ],
  [
    "workbench header is not framed as a card",
    /border:\s*"1px solid var\(--border-subtle\)"|borderRadius:\s*"var\(--radius-md\)"|background:\s*"var\(--bg-surface\)"/,
    launchHeaderBlock,
  ],
  [
    "workbench header does not use large card padding",
    /padding:\s*"var\(--space-4\)"/,
    launchHeaderBlock,
  ],
];

const missing = requirements
  .filter(([, pattern, source = workbenchView]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} compact workbench layout requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden compact layout pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Workbench compact dark layout contract passed.");
