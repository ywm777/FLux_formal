import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const drawer = readFileSync(
  resolve(root, "../../packages/ui/src/components/Drawer.tsx"),
  "utf8",
);

const closeButtonSource =
  drawer.match(/<button[\s\S]*?aria-label="关闭"[\s\S]*?<\/button>/)?.[0] ?? "";
const closeStyleSource =
  drawer.match(/function closeButtonStyle[\s\S]*$/)?.[0] ?? "";

const requirements = [
  [
    "drawer close control exposes an accessible label and tooltip",
    /aria-label="关闭"[\s\S]*title="关闭"/,
    closeButtonSource,
  ],
  [
    "drawer close control is icon-only",
    /<svg[\s\S]*aria-hidden="true"[\s\S]*focusable="false"[\s\S]*stroke="currentColor"/,
    closeButtonSource,
  ],
  [
    "drawer close control has stable square dimensions",
    /width:\s*28[\s\S]*height:\s*28/,
    closeStyleSource,
  ],
  [
    "drawer close hover state uses semantic surface and text tokens",
    /background:\s*hover \? "var\(--bg-inset\)" : "transparent"[\s\S]*color:\s*hover \? "var\(--text-primary\)" : "var\(--text-muted\)"/,
    closeStyleSource,
  ],
  [
    "drawer close transition uses shared motion tokens",
    /transition:\s*"background var\(--motion-fast\) var\(--ease-standard\), color var\(--motion-fast\) var\(--ease-standard\)"/,
    closeStyleSource,
  ],
];

const forbidden = [
  [
    "drawer close control does not render a text multiplication sign",
    />\s*×\s*<\/button>/,
    closeButtonSource,
  ],
  [
    "drawer chrome does not hard-code raw colors",
    /#[0-9a-fA-F]{3,8}|rgba?\(/,
    drawer,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} shared drawer chrome requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden shared drawer chrome pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Shared drawer chrome contract passed.");
