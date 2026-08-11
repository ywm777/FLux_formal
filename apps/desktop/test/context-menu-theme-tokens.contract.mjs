import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contextMenu = readFileSync(
  resolve(root, "src/features/canvas/ContextMenu.tsx"),
  "utf8",
);
const tokens = readFileSync(
  resolve(root, "../../packages/ui/src/tokens/tokens.css"),
  "utf8",
);

const menuSource =
  contextMenu.match(/className="canvas-context-menu"[\s\S]*?\}\}\s*>/)?.[0] ??
  "";

const requirements = [
  [
    "context menu exposes a stable canvas menu selector",
    /className="canvas-context-menu"/,
    contextMenu,
  ],
  [
    "context menu uses the elevated surface token",
    /background:\s*"var\(--bg-elevated\)"/,
    menuSource,
  ],
  [
    "context menu uses the popover shadow token",
    /boxShadow:\s*"var\(--shadow-popover\)"/,
    menuSource,
  ],
  [
    "context menu uses a named canvas context menu layer token",
    /zIndex:\s*"var\(--z-context-menu\)" as unknown as number/,
    menuSource,
  ],
  [
    "shared tokens define the context menu layer between canvas palette and top bar",
    /--z-canvas-palette:\s*250;[\s\S]*--z-context-menu:\s*260;[\s\S]*--z-topbar:\s*300;/,
    tokens,
  ],
];

const forbidden = [
  [
    "ContextMenu does not hard-code raw translucent colors",
    /rgba?\(/,
    contextMenu,
  ],
  [
    "ContextMenu does not hard-code its z-index value",
    /zIndex:\s*1000/,
    contextMenu,
  ],
  [
    "ContextMenu does not borrow the command palette layer token",
    /zIndex:\s*"var\(--z-command-palette\)"/,
    contextMenu,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} context menu theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden context menu theme-token pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Context menu theme token contract passed.");
