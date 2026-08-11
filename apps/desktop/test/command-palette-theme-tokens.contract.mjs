import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const commandPalette = readFileSync(
  resolve(root, "packages/ui/src/components/CommandPalette.tsx"),
  "utf8",
);
const tokens = readFileSync(
  resolve(root, "packages/ui/src/tokens/tokens.css"),
  "utf8",
);

const dialogSource =
  commandPalette.match(/role="dialog"[\s\S]*?paddingTop: "12vh"/)?.[0] ?? "";
const panelSource =
  commandPalette.match(/width: 520[\s\S]*?overflow: "hidden"/)?.[0] ?? "";

const requirements = [
  [
    "command palette overlay uses the shared scrim token",
    /background:\s*"var\(--overlay-scrim\)"/,
    dialogSource,
  ],
  [
    "command palette z-index uses the shared command palette layer token",
    /zIndex:\s*"var\(--z-command-palette\)" as unknown as number/,
    dialogSource,
  ],
  [
    "command palette panel uses the command shadow token",
    /boxShadow:\s*"var\(--shadow-command\)"/,
    panelSource,
  ],
  [
    "shared tokens define overlay and command shadow tokens",
    /--overlay-scrim:[\s\S]*--shadow-command:/,
    tokens,
  ],
];

const forbidden = [
  [
    "CommandPalette does not hard-code raw translucent colors",
    /rgba?\(/,
    commandPalette,
  ],
  [
    "CommandPalette does not hard-code the command z-index layer",
    /zIndex:\s*400/,
    commandPalette,
  ],
  [
    "CommandPalette does not borrow the drawer shadow token",
    /boxShadow:\s*"var\(--shadow-drawer\)"/,
    commandPalette,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} command palette theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden command palette theme-token pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Command palette theme token contract passed.");
