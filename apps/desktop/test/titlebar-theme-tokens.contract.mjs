import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const controlButtonSource =
  titleBar.match(/function ControlButton[\s\S]*?const accountMenuWrap/)?.[0] ?? "";

const requirements = [
  [
    "window control hover states use semantic theme tokens",
    /background:\s*hover[\s\S]*danger[\s\S]*\?\s*"var\(--danger\)"[\s\S]*:\s*"var\(--bg-inset\)"/,
    controlButtonSource,
  ],
  [
    "danger window control foreground stays token-driven",
    /color:\s*hover && danger \? "var\(--text-primary\)" : "var\(--text-muted\)"/,
    controlButtonSource,
  ],
  [
    "window control transitions use motion tokens",
    /transition:\s*"background var\(--motion-fast\) var\(--ease-standard\), color var\(--motion-fast\) var\(--ease-standard\)"/,
    controlButtonSource,
  ],
];

const forbidden = [
  [
    "titlebar implementation does not use raw hex colors",
    /#[0-9a-fA-F]{3,8}/,
    titleBar,
  ],
  [
    "window controls do not hard-code Windows close colors",
    /#e81123|#fff/i,
    controlButtonSource,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} titlebar theme-token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden titlebar theme-token pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Titlebar theme token contract passed.");
