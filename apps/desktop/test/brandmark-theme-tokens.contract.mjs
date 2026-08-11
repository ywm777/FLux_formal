import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const brandMark = readFileSync(resolve(root, "src/components/BrandMark.tsx"), "utf8");
const tokens = readFileSync(resolve(root, "../../packages/ui/src/tokens/tokens.css"), "utf8");

const requirements = [
  [
    "brand gradient start uses a theme token",
    /stopColor="var\(--brand-mark-start\)"/,
    brandMark,
  ],
  [
    "brand gradient end uses a theme token",
    /stopColor="var\(--brand-mark-end\)"/,
    brandMark,
  ],
  [
    "brand core uses a theme token",
    /fill="var\(--brand-mark-core\)"/,
    brandMark,
  ],
  [
    "brand tokens are defined in the shared token sheet",
    /--brand-mark-start:[\s\S]*--brand-mark-end:[\s\S]*--brand-mark-core:/,
    tokens,
  ],
];

const forbidden = [
  [
    "BrandMark does not hard-code raw hex colors",
    /#[0-9a-fA-F]{3,8}/,
    brandMark,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern, source]) => pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} BrandMark token requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden BrandMark pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("BrandMark theme token contract passed.");
