import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const tokens = readFileSync(
  resolve(root, "../../packages/ui/src/tokens/tokens.css"),
  "utf8",
);

const accountMenuSource =
  titleBar.match(/const accountMenu: React\.CSSProperties = \{[\s\S]*?\n\};/)?.[0] ??
  "";
const commandButtonSource =
  titleBar.match(/const commandButton: React\.CSSProperties = \{[\s\S]*?\n\};/)?.[0] ??
  "";
const canvasActionButtonSource =
  titleBar.match(/const workflowPrimaryButton: React\.CSSProperties = \{[\s\S]*?\n\};/)?.[0] ??
  "";

const requirements = [
  [
    "My Space menu exposes a stable product popover selector",
    /className="account-menu-panel"/,
    titleBar,
  ],
  [
    "My Space menu uses the elevated surface token",
    /background:\s*"var\(--bg-elevated\)"/,
    accountMenuSource,
  ],
  [
    "My Space menu uses the popover shadow token",
    /boxShadow:\s*"var\(--shadow-popover\)"/,
    accountMenuSource,
  ],
  [
    "My Space menu uses the shared popover layer token",
    /zIndex:\s*"var\(--z-popover\)" as unknown as number/,
    accountMenuSource,
  ],
  [
    "top bar command button transition uses motion tokens",
    /transition:\s*"border-color var\(--motion-fast\) var\(--ease-standard\), color var\(--motion-fast\) var\(--ease-standard\), background var\(--motion-fast\) var\(--ease-standard\)"/,
    commandButtonSource,
  ],
  [
    "canvas action button transition uses motion tokens",
    /transition:\s*"border-color var\(--motion-fast\) var\(--ease-standard\), color var\(--motion-fast\) var\(--ease-standard\), background var\(--motion-fast\) var\(--ease-standard\)"/,
    canvasActionButtonSource,
  ],
  [
    "shared tokens define the popover layer",
    /--z-popover:\s*500;/,
    tokens,
  ],
];

const forbidden = [
  [
    "My Space menu does not hard-code its z-index",
    /zIndex:\s*200/,
    accountMenuSource,
  ],
  [
    "top bar actions do not hard-code transition timings",
    /120ms ease/,
    `${commandButtonSource}\n${canvasActionButtonSource}`,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} titlebar account-menu theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden titlebar account-menu theme-token pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Titlebar account-menu theme token contract passed.");
