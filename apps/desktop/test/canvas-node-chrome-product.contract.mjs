import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);

const toolbarSource = fluxNode;
const toolbarStyleSource =
  fluxNode.match(/const toolbarStyle[\s\S]*?const toolbarButtonStyle/)?.[0] ?? "";
const runBadgeSource =
  fluxNode.match(/function runBadgeStyle[\s\S]*?function runDotStyle/)?.[0] ?? "";

const requirements = [
  [
    "append action uses an icon, not a text plus control",
    /<ToolbarButton label="追加下游节点"[\s\S]*icon="append"[\s\S]*name === "append"[\s\S]*<svg[\s\S]*stroke="currentColor"/,
    toolbarSource,
  ],
  [
    "node toolbar uses the same quiet surface as the node",
    /background:\s*"var\(--bg-surface\)"/,
    toolbarStyleSource,
  ],
  [
    "node run status avoids stacking another inset pill",
    /border:\s*"none"[\s\S]*background:\s*"transparent"/,
    runBadgeSource,
  ],
];

const forbidden = [
  [
    "append action does not render a bare plus sign",
    />\s*\+\s*<\/button>/,
    toolbarSource,
  ],
  [
    "FluxNode does not hard-code translucent color values",
    /rgba?\(/,
    fluxNode,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas node chrome requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas node chrome pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node chrome product contract passed.");
