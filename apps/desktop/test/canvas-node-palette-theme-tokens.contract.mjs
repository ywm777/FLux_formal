import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const palette = readFileSync(
  resolve(root, "src/features/canvas/CanvasNodePalette.tsx"),
  "utf8",
);
const tokens = readFileSync(
  resolve(root, "../../packages/ui/src/tokens/tokens.css"),
  "utf8",
);

const panelSource =
  palette.match(/className="canvas-node-palette"[\s\S]*?onPointerDown/)?.[0] ?? "";

const requirements = [
  [
    "canvas node palette uses the elevated surface token",
    /background:\s*"var\(--bg-elevated\)"/,
    panelSource,
  ],
  [
    "canvas node palette uses the popover shadow token",
    /boxShadow:\s*"var\(--shadow-popover\)"/,
    panelSource,
  ],
  [
    "canvas node palette uses a named canvas palette layer token",
    /zIndex:\s*"var\(--z-canvas-palette\)" as unknown as number/,
    panelSource,
  ],
  [
    "shared tokens define the canvas palette layer below the top bar",
    /--z-canvas-palette:\s*250;/,
    tokens,
  ],
];

const forbidden = [
  [
    "CanvasNodePalette does not hard-code raw translucent colors",
    /rgba?\(/,
    palette,
  ],
  [
    "CanvasNodePalette does not hard-code its z-index value",
    /zIndex:\s*250/,
    palette,
  ],
  [
    "CanvasNodePalette does not borrow the drawer shadow token",
    /boxShadow:\s*"var\(--shadow-drawer\)"/,
    palette,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas node palette theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas node palette theme-token pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node palette theme token contract passed.");
