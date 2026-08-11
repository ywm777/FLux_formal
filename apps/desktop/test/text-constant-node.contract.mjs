import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const productivity = read("packages/node-sdk/src/builtin/productivity.ts");
const catalog = read("packages/node-sdk/src/builtin/index.ts");
const surface = read("apps/desktop/src/features/canvas/nodeBusinessSurface.ts");
const fluxNode = read("apps/desktop/src/features/canvas/FluxNode.tsx");

const requirements = [
  [
    "text constant is a source-only node with one typed text output",
    /id: "flux\.source\.textConstant"[\s\S]*inputs: \[\][\s\S]*outputs: \[\{ id: "out", name: "固定文本", dataType: "text" \}\]/,
    productivity,
  ],
  [
    "constant content is persisted in node configuration and emitted unchanged",
    /title: "常量内容"[\s\S]*format: "code"[\s\S]*const text = String\(ctx\.config\.text \?\? ""\)[\s\S]*out: \{ text, value: text \}/,
    productivity,
  ],
  [
    "text constant is exposed immediately after the runtime text node",
    /catalogNodes[\s\S]*textInputNode,\s*textConstantNode,\s*jsonFormatNode/,
    catalog,
  ],
  [
    "canvas recognizes constant text as an editable source payload",
    (source) =>
      /PAYLOAD_KEYS = \["text"/.test(source) &&
      /definition\.id === "flux\.source\.textConstant"[\s\S]*"固定内容"/.test(source),
    surface,
  ],
  [
    "constant editor is expanded when the node first appears",
    /useState\(d\.fluxType === "flux\.source\.textConstant"\)/,
    fluxNode,
  ],
];

const missing = requirements
  .filter(([, check, source]) => typeof check === "function" ? !check(source) : !check.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} text-constant requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Text constant node contract passed.");
