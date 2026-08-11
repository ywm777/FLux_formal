import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const titleBar = readFileSync(resolve(root, "src/components/TitleBar.tsx"), "utf8");
const workbenchContract = readFileSync(resolve(root, "test/workbench.contract.mjs"), "utf8");

const requirements = [
  [
    "title bar renders a compact primary navigation segment",
    /role="tablist"[\s\S]*aria-label="主导航"[\s\S]*\{PRIMARY_NAV\.map/,
  ],
  [
    "primary navigation has explicit workbench and canvas destinations",
    /const PRIMARY_NAV[\s\S]*mode:\s*"workbench"[\s\S]*label:\s*"工作台"[\s\S]*mode:\s*"canvas"[\s\S]*label:\s*"画布"/,
  ],
  [
    "workbench navigation copy does not imply published-only content",
    /description:\s*"查看工作流"/,
  ],
  [
    "navigation tabs expose selected state and set the exact destination",
    /aria-selected=\{active\}[\s\S]*onClick=\{\(\) => setMode\(item\.mode\)\}/,
  ],
  [
    "title bar avoids explanatory switch copy",
    !/切到|targetMode|targetLabel/.test(titleBar),
  ],
  [
    "workbench contract tracks the primary navigation instead of old switch copy",
    /role="tablist"[\s\S]*aria-label="主导航"/,
    workbenchContract,
  ],
];

const missing = requirements
  .filter(([, pattern, source = titleBar]) => {
    if (typeof pattern === "boolean") return !pattern;
    return !pattern.test(source);
  })
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} titlebar navigation requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Titlebar navigation contract passed.");
