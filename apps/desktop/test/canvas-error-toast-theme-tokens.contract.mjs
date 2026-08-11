import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canvasView = readFileSync(
  resolve(root, "src/features/canvas/CanvasView.tsx"),
  "utf8",
);
const tokens = readFileSync(
  resolve(root, "../../packages/ui/src/tokens/tokens.css"),
  "utf8",
);

const errorRenderSource =
  canvasView.match(/\{error && \([\s\S]*?\)\}/)?.[0] ?? "";
const errorStyleSource =
  canvasView.match(/const errorStyle: React\.CSSProperties = \{[\s\S]*?\n\};/)?.[0] ??
  "";

const requirements = [
  [
    "canvas error toast exposes a stable product selector",
    /className="canvas-error-toast"/,
    errorRenderSource,
  ],
  [
    "canvas error toast uses alert semantics",
    /role="alert"/,
    errorRenderSource,
  ],
  [
    "canvas error toast uses the shared toast layer token",
    /zIndex:\s*"var\(--z-toast\)" as unknown as number/,
    errorStyleSource,
  ],
  [
    "canvas error toast uses the shared popover shadow token",
    /boxShadow:\s*"var\(--shadow-popover\)"/,
    errorStyleSource,
  ],
  [
    "canvas error toast constrains long product error copy",
    /maxWidth:\s*"min\(360px, calc\(100vw - var\(--space-8\)\)\)"[\s\S]*wordBreak:\s*"break-word"/,
    errorStyleSource,
  ],
  [
    "shared tokens define the toast layer below modal surfaces",
    /--z-toast:\s*600;[\s\S]*--z-modal:\s*700;/,
    tokens,
  ],
];

const forbidden = [
  [
    "Canvas error toast does not hard-code its z-index value",
    /zIndex:\s*100/,
    errorStyleSource,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas error-toast theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas error-toast theme-token pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas error-toast theme token contract passed.");
