import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..", "..", "..");
const commandPalette = readFileSync(
  resolve(root, "packages/ui/src/components/CommandPalette.tsx"),
  "utf8",
);
const commandPaletteDist = readFileSync(
  resolve(root, "packages/ui/dist/components/CommandPalette.js"),
  "utf8",
);
const optionButtonSource =
  commandPalette.match(
    /<button[\s\S]*key=\{item\.id\}[\s\S]*onClick=\{\(\) => commit\(index\)\}[\s\S]*?<\/button>/,
  )?.[0] ?? "";

const requirements = [
  [
    "command palette creates stable option ids from command ids",
    /function optionId\(id: string\): string \{[\s\S]*command-palette-option-\$\{id\.replace\(/,
  ],
  [
    "command palette exposes a dialog with a product label",
    /role="dialog"[\s\S]*aria-label="命令面板"/,
  ],
  [
    "command input uses combobox semantics connected to the result list",
    /role="combobox"[\s\S]*aria-label="搜索命令"[\s\S]*aria-expanded=\{open\}[\s\S]*aria-controls="command-palette-list"[\s\S]*aria-activedescendant=\{activeOptionId\}[\s\S]*aria-autocomplete="list"/,
  ],
  [
    "command results expose a listbox",
    /id="command-palette-list"[\s\S]*role="listbox"[\s\S]*aria-label="命令结果"/,
  ],
  [
    "command result rows expose stable option semantics",
    /id=\{optionId\(item\.id\)\}[\s\S]*role="option"[\s\S]*aria-selected=\{index === active\}/,
    optionButtonSource,
  ],
  [
    "built ui package carries the dialog semantics consumed by desktop",
    /role:\s*"dialog"[\s\S]*"aria-label":\s*"\\u547D\\u4EE4\\u9762\\u677F"/,
    commandPaletteDist,
  ],
  [
    "built ui package carries the combobox semantics consumed by desktop",
    /role:\s*"combobox"[\s\S]*"aria-label":\s*"\\u641C\\u7D22\\u547D\\u4EE4"[\s\S]*"aria-expanded":\s*open[\s\S]*"aria-controls":\s*"command-palette-list"[\s\S]*"aria-activedescendant":\s*activeOptionId[\s\S]*"aria-autocomplete":\s*"list"/,
    commandPaletteDist,
  ],
  [
    "built ui package carries listbox option semantics consumed by desktop",
    /id:\s*"command-palette-list"[\s\S]*role:\s*"listbox"[\s\S]*"aria-label":\s*"\\u547D\\u4EE4\\u7ED3\\u679C"[\s\S]*id:\s*optionId\(item\.id\)[\s\S]*role:\s*"option"[\s\S]*"aria-selected":\s*index === active/,
    commandPaletteDist,
  ],
];

const forbidden = [
  [
    "command palette result rows are not anonymous buttons only",
    optionButtonSource.length > 0 && !/role="option"/.test(optionButtonSource),
  ],
];

const missing = requirements
  .filter(([, pattern, source = commandPalette]) => !pattern.test(source))
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern === true)
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} command palette accessibility requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden command palette pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Command palette accessibility contract passed.");
