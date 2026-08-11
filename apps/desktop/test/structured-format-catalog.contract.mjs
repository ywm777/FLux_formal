import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const packageJson = JSON.parse(readFileSync(resolve(repoRoot, "packages/node-sdk/package.json"), "utf8"));
const nodes = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/structured-formats.ts"), "utf8");
const index = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/index.ts"), "utf8");
const surface = readFileSync(resolve(desktopRoot, "src/features/canvas/nodeBusinessSurface.ts"), "utf8");

const requirements = [
  ["fast-xml-parser is a direct SDK dependency", typeof packageJson.dependencies?.["fast-xml-parser"] === "string"],
  ["yaml is a direct SDK dependency", typeof packageJson.dependencies?.yaml === "string"],
  ["XML node supports both conversion directions", /id:\s*"flux\.transform\.xml"[\s\S]*"xml-to-json"[\s\S]*"json-to-xml"/.test(nodes)],
  ["YAML node supports YML and both conversion directions", /id:\s*"flux\.transform\.yaml"[\s\S]*YAML\/YML[\s\S]*"yaml-to-json"[\s\S]*"json-to-yaml"/.test(nodes)],
  ["conversion outputs expose text, value, and data for chaining", /outputs:\s*\{ out:\s*\{ text, value:\s*text, data/.test(nodes)],
  ["JSON to XML wraps multi-field business payloads in a configurable root", /function normalizeXmlRoot[\s\S]*rootName\.trim\(\)[\s\S]*return \{ \[normalizedRootName\]: value \}[\s\S]*title:\s*"XML 根元素"/.test(nodes)],
  ["public catalog starts with text and structured conversion tools", /export const catalogNodes:[\s\S]*textInputNode,[\s\S]*jsonFormatNode,[\s\S]*xmlConvertNode,[\s\S]*yamlConvertNode,/.test(index)],
  ["historical scenario nodes remain in the execution registry", /export const builtinNodes:[\s\S]*\.\.\.scenarioNodes/.test(index)],
  ["canvas exposes readable direction labels", /"xml-to-json":\s*"XML → JSON"[\s\S]*"json-to-yaml":\s*"JSON → YAML"/.test(surface)],
];

const missing = requirements.filter(([, passed]) => !passed).map(([label]) => label);
if (missing.length) {
  console.error(`Missing ${missing.length} structured format requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Structured format catalog contract passed.");
