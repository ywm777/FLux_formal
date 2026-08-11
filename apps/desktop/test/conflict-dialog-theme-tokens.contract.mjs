import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const conflictDialog = readFileSync(
  resolve(root, "src/features/canvas/ConflictDialog.tsx"),
  "utf8",
);
const tokens = readFileSync(
  resolve(root, "../../packages/ui/src/tokens/tokens.css"),
  "utf8",
);

const overlaySource =
  conflictDialog.match(/className="conflict-dialog-overlay"[\s\S]*?justifyContent/)?.[0] ??
  "";

const requirements = [
  [
    "conflict dialog exposes a stable modal overlay selector",
    /className="conflict-dialog-overlay"/,
    conflictDialog,
  ],
  [
    "conflict dialog overlay uses the shared scrim token",
    /background:\s*"var\(--overlay-scrim\)"/,
    overlaySource,
  ],
  [
    "conflict dialog overlay uses the shared modal layer token",
    /zIndex:\s*"var\(--z-modal\)" as unknown as number/,
    overlaySource,
  ],
  [
    "shared tokens define scrim and modal layer tokens",
    /--overlay-scrim:[\s\S]*--z-modal:\s*700;/,
    tokens,
  ],
];

const forbidden = [
  [
    "ConflictDialog does not hard-code raw translucent colors",
    /rgba?\(/,
    conflictDialog,
  ],
  [
    "ConflictDialog does not hard-code its modal z-index",
    /zIndex:\s*700/,
    conflictDialog,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} conflict dialog theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden conflict dialog theme-token pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Conflict dialog theme token contract passed.");
