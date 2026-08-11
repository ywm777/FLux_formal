import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const nodeInspector = readFileSync(
  resolve(root, "src/features/canvas/NodeInspector.tsx"),
  "utf8",
);

const requirements = [
  [
    "node inspector is explicitly positioned as advanced settings",
    /title="高级设置"[\s\S]*width=\{360\}[\s\S]*variant="overlay"[\s\S]*ariaLabel="节点高级设置"/,
  ],
  [
    "advanced settings retain editable node naming",
    /<Field label="节点名称"[\s\S]*onLabelChange\(event\.target\.value\)/,
  ],
  [
    "advanced settings use schema-driven low-frequency configuration",
    /toFormSchema\(def\?\.configSchema\)[\s\S]*<SchemaForm[\s\S]*value=\{node\.data\.config\}[\s\S]*onChange=\{onConfigChange\}/,
  ],
  [
    "advanced settings retain product-facing type and capability context",
    /getNodeTypeName\(node\.data\.fluxType\)[\s\S]*getNodeTypeSummary\(node\.data\.fluxType\)[\s\S]*getCarrierLabel\(node\.data\.carrier\)/,
  ],
  [
    "advanced settings retain readable connection counts",
    /\{node\.data\.inputs\.length\} 个输入 \/ \{node\.data\.outputs\.length\} 个输出/,
  ],
  [
    "advanced settings use concise empty copy",
    /无需高级设置/,
  ],
];

const forbidden = [
  ["runtime input does not live in the advanced settings drawer", /本次运行输入|runtimeInput/],
  ["run output does not live in the advanced settings drawer", /最近运行|复制结果|outputPreview/],
  ["advanced settings do not use the old node-details title", /title="节点详情"|title="节点配置"/],
  ["advanced settings do not expose implementation carrier terminology", />载体</],
  ["advanced settings do not expose implementation port terminology", />端口</],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(nodeInspector))
  .map(([label]) => label);
const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(nodeInspector))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} node advanced-settings requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden advanced-settings pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node advanced-settings contract passed.");
