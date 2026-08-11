import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);
const nodeShell = readFileSync(
  resolve(root, "../../packages/ui/src/components/NodeShell.tsx"),
  "utf8",
);
const tokens = readFileSync(
  resolve(root, "../../packages/ui/src/tokens/tokens.css"),
  "utf8",
);

const requirements = [
  [
    "shared tokens define a semantic node selected ring shadow",
    /--shadow-node-selected:\s*0 0 0 2px var\(--accent\);/,
    tokens,
  ],
  [
    "shared tokens define semantic resting and hover node shadows",
    /--shadow-node:[^;]+;[\s\S]*--shadow-node-hover:[^;]+;/,
    tokens,
  ],
  [
    "FluxNode selected state uses the selected ring and resting node shadow tokens",
    /boxShadow:\s*selected \? "var\(--shadow-node-selected\)" : "var\(--shadow-node\)"/,
    fluxNode,
  ],
  [
    "NodeShell selected state uses the node selected ring token",
    /boxShadow:\s*selected \? "var\(--shadow-node-selected\)" : undefined/,
    nodeShell,
  ],
];

const forbidden = [
  [
    "FluxNode does not hard-code the selected ring shadow",
    /0 0 0 2px var\(--accent\)/,
    fluxNode,
  ],
  [
    "NodeShell does not hard-code the selected ring shadow",
    /0 0 0 2px var\(--accent\)/,
    nodeShell,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} node selection ring theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden node selection ring pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Node selection ring theme token contract passed.");
