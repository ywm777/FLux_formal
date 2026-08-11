import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);

const requirements = [
  [
    "node shell uses a softer layered dark surface instead of a flat fill",
    /background:\s*"linear-gradient\(150deg, var\(--bg-elevated\) 0%, var\(--bg-surface\) 58%, var\(--bg-inset\) 145%\)"/,
  ],
  [
    "node shell uses stable role-specific desktop widths",
    /const NODE_WIDTH: Record<NodeBusinessKind, number>[\s\S]*"runtime-input": 328[\s\S]*decision: 304[\s\S]*approval: 310[\s\S]*output: 342[\s\S]*width: NODE_WIDTH\[kind\]/,
  ],
  [
    "node surface isolates decorative glow from readable content",
    /const nodeSurfaceStyle[\s\S]*isolation:\s*"isolate"/,
  ],
  [
    "node uses a restrained carrier-colored top tint without decorative orbs",
    /function nodeTintStyle[\s\S]*linear-gradient\(90deg, \$\{color\}, transparent\)[\s\S]*opacity:\s*0\.9/,
  ],
  [
    "node includes a short carrier-colored signal instead of a full-height stripe",
    /function accentRailStyle[\s\S]*top:\s*17[\s\S]*width:\s*2[\s\S]*height:\s*30[\s\S]*background:\s*color/,
  ],
  [
    "node header uses a role icon and compact identity hierarchy",
    /<NodeRoleIcon kind=\{presentation\.kind\} \/>[\s\S]*const nodeHeaderStyle[\s\S]*gridTemplateColumns:\s*"34px minmax\(0, 1fr\) auto"/,
  ],
  [
    "role icon uses a soft carrier-colored circular surface",
    /function roleIconStyle[\s\S]*border:\s*"none"[\s\S]*borderRadius:\s*"var\(--radius-full\)"[\s\S]*color-mix\(in srgb, \$\{color\} 13%, var\(--bg-inset\)\)/,
  ],
  [
    "node keeps header and role-specific body above decorative layers",
    /const nodeHeaderStyle[\s\S]*position:\s*"relative"[\s\S]*zIndex:\s*1[\s\S]*const nodeBodyStyle[\s\S]*position:\s*"relative"[\s\S]*zIndex:\s*1/,
  ],
  [
    "step badge numbers use tabular figures to avoid visual jitter",
    /const stepBadgeStyle[\s\S]*fontVariantNumeric:\s*"tabular-nums"/,
  ],
  [
    "node renders a status rail when run state is present",
    /d\.run \? <div aria-hidden style=\{runStatusRailStyle\(d\.run\.status\)\} \/> : null[\s\S]*function runStatusRailStyle[\s\S]*height:\s*2[\s\S]*background:\s*RUN_COLOR\[status\]/,
  ],
  [
      "connector handles render as quiet circular ports with a stable hit target",
      /canvasPortHandleClassName\(d,[\s\S]*function canvasPortHandleClassName[\s\S]*"canvas-port-handle"[\s\S]*"is-edge-selected"[\s\S]*function perimeterHandleStyle[\s\S]*width:\s*7[\s\S]*height:\s*7[\s\S]*background:\s*"var\(--bg-base\)"[\s\S]*border:\s*"1px solid var\(--border-strong\)"/,
  ],
  [
    "run status is quiet dot-and-text metadata rather than another pill",
    /function runBadgeStyle[\s\S]*padding:\s*0[\s\S]*border:\s*"none"[\s\S]*background:\s*"transparent"[\s\S]*color:\s*RUN_COLOR\[status\]/,
  ],
  [
    "runtime input keeps the node body focused on editable business fields",
    /function RuntimeInputSurface[\s\S]*interaction\.onChange[\s\S]*interaction\.error/,
  ],
  [
    "delivery output uses a quiet inset success marker",
    /function deliveryValueStyle[\s\S]*border:\s*"none"[\s\S]*boxShadow:\s*"inset 2px 0 0 var\(--success\)"/,
  ],
];

const forbidden = [
  ["node visual polish should stay token-driven without raw rgba values", /rgba?\(/],
  ["node visual polish should not add emoji or text-only decorations", /[🎨🚀✨]/],
  ["node visual polish should not use radial decorative glows", /radial-gradient/],
  ["runtime input node should not contain a duplicate execution action", /runtimeSubmitStyle|runtimeFooterStyle|interaction\.onSubmit|开始运行|运行工作流|重新运行/],
];

const missing = requirements
  .filter(([, pattern]) => !pattern.test(fluxNode))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(fluxNode))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas node visual-polish requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden visual-polish pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node visual polish contract passed.");
