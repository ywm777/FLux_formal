import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const fluxNode = readFileSync(
  resolve(root, "src/features/canvas/FluxNode.tsx"),
  "utf8",
);
const globalCss = readFileSync(resolve(root, "src/global.css"), "utf8");

const toolbarButtonsSource = fluxNode;
const toolbarButtonStyleSource =
  fluxNode.match(/const toolbarButtonStyle: CSSProperties = \{[\s\S]*?\};/)?.[0] ??
  "";

const requirements = [
  [
    "node toolbar icon buttons expose a stable interaction class",
    /className="canvas-node-toolbar-button"/,
    toolbarButtonsSource,
  ],
  [
    "delete toolbar action exposes a danger tone for styling",
    /data-tone=\{danger \? "danger" : undefined\}[\s\S]*aria-label=\{label\}/,
    toolbarButtonsSource,
  ],
  [
    "node toolbar button hover state uses tokenized dark feedback",
    /\.canvas-node-toolbar-button:hover[\s\S]*background:\s*var\(--bg-inset\)/,
    globalCss,
  ],
  [
    "danger node toolbar hover state uses the danger subtle token",
    /\.canvas-node-toolbar-button\[data-tone="danger"\]:hover[\s\S]*background:\s*var\(--danger-subtle\)/,
    globalCss,
  ],
  [
    "node toolbar keyboard focus is visible and tokenized",
    /\.canvas-node-toolbar-button:focus-visible[\s\S]*outline:\s*2px solid var\(--accent\)[\s\S]*outline-offset:\s*2px/,
    globalCss,
  ],
  [
    "node toolbar button transitions use motion tokens",
    /\.canvas-node-toolbar-button[\s\S]*transition:\s*background var\(--motion-fast\) var\(--ease-standard\), color var\(--motion-fast\) var\(--ease-standard\)/,
    globalCss,
  ],
];

const forbidden = [
  [
    "toolbar button style does not inline a background that blocks CSS hover",
    /background:\s*"transparent"/,
    toolbarButtonStyleSource,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas node toolbar interaction requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas node toolbar interaction pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node toolbar interaction contract passed.");
