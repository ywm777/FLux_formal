import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const app = readFileSync(resolve(root, "src/App.tsx"), "utf8");
const css = readFileSync(resolve(root, "src/global.css"), "utf8");

const requirements = [
  [
    "workbench and canvas expose an explicit transition state",
    /className="app-view-layer"[\s\S]*data-app-view="workbench"[\s\S]*data-view-state=\{mode === "workbench" \? "active" : "inactive"\}[\s\S]*data-app-view="canvas"[\s\S]*data-view-state=\{mode === "canvas" \? "active" : "inactive"\}/,
    app,
  ],
  [
    "view layers keep both surfaces mounted and animate opacity plus transform",
    /\.app-view-layer\s*\{[\s\S]*opacity var\(--motion-normal\) var\(--ease-out\)[\s\S]*transform var\(--motion-normal\) var\(--ease-out\)/,
    css,
  ],
  [
    "inactive layers are non-interactive while the active layer is promoted",
    /function viewLayerStyle\(active: boolean\)[\s\S]*pointerEvents: active \? "auto" : "none"[\s\S]*zIndex: active \? 1 : 0/,
    app,
  ],
  [
    "exit transition is shorter than the entering transition",
    /\.app-view-layer\[data-view-state="inactive"\][\s\S]*transition-duration: calc\(var\(--motion-normal\) \* 0\.8\)/,
    css,
  ],
  [
    "reduced motion disables the transition",
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition-duration: 0\.01ms !important/,
    css,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} view transition requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("View transition contract passed.");
