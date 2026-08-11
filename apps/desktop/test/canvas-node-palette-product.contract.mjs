import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const palette = readFileSync(
  resolve(root, "src/features/canvas/CanvasNodePalette.tsx"),
  "utf8",
);

const requirements = [
  [
    "node palette is an accessible add-node dialog without becoming a permanent panel",
    /className="canvas-node-palette"[\s\S]*role="dialog"[\s\S]*aria-label="添加节点"[\s\S]*position:\s*"fixed"/,
  ],
  [
    "node search input uses product-facing ability language",
    /role="combobox"[\s\S]*aria-label="搜索能力"[\s\S]*aria-expanded=\{open\}[\s\S]*aria-controls="canvas-node-palette-list"[\s\S]*aria-activedescendant=\{activeOptionId\}/,
  ],
  [
    "node results are exposed as an ability listbox with selectable options",
    /id="canvas-node-palette-list"[\s\S]*role="listbox"[\s\S]*aria-label="能力列表"[\s\S]*role="option"[\s\S]*aria-selected=\{index === active\}/,
  ],
  [
    "active option ids are stable enough for aria-activedescendant",
    (source) =>
      /function optionId\(id: string\): string/.test(source) &&
      /replace\(\/\[\^a-zA-Z0-9_-\]\/g,\s*"-"\)/.test(source) &&
      /const activeOptionId = filtered\[active\]\s*\?\s*optionId\(filtered\[active\]\.id\)\s*:\s*undefined/.test(
        source,
      ),
  ],
  [
    "empty search state uses product-facing copy",
    /没有匹配的能力/,
  ],
];

const forbidden = [
  [
    "node palette does not expose implementation-facing node type copy",
    /搜索节点|搜索节点类型|节点类型|没有匹配的节点|无匹配节点/,
  ],
  [
    "node palette does not expose a permanent library surface",
    /节点库|拖入画布|library/i,
  ],
];

const missing = requirements
  .filter(([, pattern]) =>
    typeof pattern === "function" ? !pattern(palette) : !pattern.test(palette),
  )
  .map(([label]) => label);

const presentForbidden = forbidden
  .filter(([, pattern]) => pattern.test(palette))
  .map(([label]) => label);

if (missing.length > 0 || presentForbidden.length > 0) {
  console.error(`Missing ${missing.length} canvas node palette product requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  console.error(`Found ${presentForbidden.length} forbidden canvas node palette pattern(s):`);
  for (const label of presentForbidden) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas node palette product contract passed.");
