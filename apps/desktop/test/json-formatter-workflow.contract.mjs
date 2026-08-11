import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const desktopRoot = resolve(import.meta.dirname, "..");
const repoRoot = resolve(desktopRoot, "../..");
const templates = readFileSync(resolve(desktopRoot, "src/lib/workflowTemplates.ts"), "utf8");
const business = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/business.ts"), "utf8");
const support = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/customer-support.ts"), "utf8");
const operations = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/operations.ts"), "utf8");
const sharedBusiness = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/shared-business.ts"), "utf8");
const productivity = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/productivity.ts"), "utf8");
const structuredFormats = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/structured-formats.ts"), "utf8");
const builtinIndex = readFileSync(resolve(repoRoot, "packages/node-sdk/src/builtin/index.ts"), "utf8");

const requirements = [
  ["customer lead processing is the public business starter", /id:\s*"customer-lead-processing"[\s\S]*title:\s*"客户线索处理"[\s\S]*人工确认[\s\S]*异常重试/, templates],
  [
    "public starters expose sales, support, and operations workflows",
    /export const PUBLIC_WORKFLOW_TEMPLATES:[\s\S]*template\.id === "customer-lead-processing"[\s\S]*template\.id === "support-ticket-triage"[\s\S]*template\.id === "purchase-approval"/,
    templates,
  ],
  ["starter connects intake, scoring, approval, archive, and notification", /type:\s*"flux\.business\.leadIntake"[\s\S]*type:\s*"flux\.business\.leadScore"[\s\S]*type:\s*"flux\.business\.humanReview"[\s\S]*type:\s*"flux\.business\.crmArchive"[\s\S]*type:\s*"flux\.business\.notifyOwner"[\s\S]*source:\s*"intake",\s*target:\s*"score"[\s\S]*source:\s*"review",\s*target:\s*"archive",\s*sourceHandle:\s*"approved"[\s\S]*source:\s*"archive",\s*target:\s*"notify"/, templates],
  ["starter uses runtime manual confirmation instead of auto-approval", /type:\s*"flux\.business\.humanReview"[\s\S]*decision:\s*"manual"/, templates],
  ["business nodes are executable and include human review plus retry notification", /id:\s*"flux\.business\.humanReview"[\s\S]*outputs:\s*\[[\s\S]*id:\s*"approved"[\s\S]*id:\s*"rejected"[\s\S]*id:\s*"flux\.business\.notifyOwner"[\s\S]*retryTimes[\s\S]*fallbackOwner/, business],
  ["support starter includes SLA routing, human takeover, reply, archive, and notification", /id:\s*"support-ticket-triage"[\s\S]*type:\s*"flux\.support\.caseIntake"[\s\S]*type:\s*"flux\.support\.caseTriage"[\s\S]*type:\s*"flux\.business\.humanReview"[\s\S]*type:\s*"flux\.support\.replyDraft"[\s\S]*type:\s*"flux\.business\.recordArchive"[\s\S]*type:\s*"flux\.business\.teamNotify"/, templates],
  ["operations starter includes policy routing and approval audit", /id:\s*"purchase-approval"[\s\S]*type:\s*"flux\.operations\.requestIntake"[\s\S]*type:\s*"flux\.operations\.policyCheck"[\s\S]*type:\s*"flux\.business\.humanReview"[\s\S]*type:\s*"flux\.business\.recordArchive"[\s\S]*type:\s*"flux\.business\.teamNotify"/, templates],
  ["support nodes provide urgent and standard SLA branches", /id:\s*"flux\.support\.caseTriage"[\s\S]*id:\s*"urgent"[\s\S]*id:\s*"standard"[\s\S]*slaMinutes/, support],
  ["operations policy provides automatic and manual branches", /id:\s*"flux\.operations\.policyCheck"[\s\S]*id:\s*"automatic"[\s\S]*id:\s*"manual"[\s\S]*requiresReview/, operations],
  ["shared business actions include archive and retry-aware notification", /id:\s*"flux\.business\.recordArchive"[\s\S]*retryTimes[\s\S]*fallbackOwner[\s\S]*id:\s*"flux\.business\.teamNotify"[\s\S]*recipients[\s\S]*retryTimes/, sharedBusiness],
  ["public catalog prioritizes common conversion nodes and hides scenario clutter", /export const catalogNodes:[\s\S]*textInputNode,[\s\S]*jsonFormatNode,[\s\S]*xmlConvertNode,[\s\S]*yamlConvertNode,[\s\S]*httpRequestNode,[\s\S]*errorCaptureNode,[\s\S]*builtinNodes:[\s\S]*\.\.\.structuredFormatNodes[\s\S]*\.\.\.scenarioNodes/, builtinIndex],
  ["JSON formatter starter remains available for existing workflows", /id:\s*"json-formatter"[\s\S]*title:\s*"JSON 文本格式优化"/, templates],
  [
    "public JSON format starter fetches once and fans out to XML and YAML outputs",
    /id:\s*"public-json-formats"[\s\S]*type:\s*"flux\.action\.http"[\s\S]*jsonplaceholder\.typicode\.com\/posts\/1[\s\S]*type:\s*"flux\.transform\.json"[\s\S]*type:\s*"flux\.transform\.xml"[\s\S]*direction:\s*"json-to-xml"[\s\S]*type:\s*"flux\.transform\.yaml"[\s\S]*direction:\s*"json-to-yaml"[\s\S]*source:\s*"parse",\s*target:\s*"xml"[\s\S]*source:\s*"parse",\s*target:\s*"yaml"/,
    templates,
  ],
  [
    "public JSON format starter is exposed in the workbench",
    /PUBLIC_WORKFLOW_TEMPLATES[\s\S]*template\.id === "public-json-formats"/,
    templates,
  ],
  ["text input exposes per-run code input and rejects empty content", /textRuntimeInputSchema[\s\S]*title:\s*"文本内容"[\s\S]*format:\s*"code"[\s\S]*id:\s*"flux\.input\.text"[\s\S]*runtimeInputSchema:\s*textRuntimeInputSchema[\s\S]*文本内容为空/, productivity],
  ["formatter validates and pretty-prints JSON", /id:\s*"flux\.transform\.jsonFormat"[\s\S]*JSON\.parse\(source\)[\s\S]*JSON\.stringify\(data, null, spacing\)/, productivity],
  ["formatter exposes key naming and string normalization rules", /keyCase:[\s\S]*camel[\s\S]*pascal[\s\S]*snake[\s\S]*kebab[\s\S]*stringCase:[\s\S]*trimStrings:[\s\S]*omitNull:/, productivity],
  ["formatter applies recursive transforms and rejects key collisions", /function transformJsonValue[\s\S]*convertJsonKey[\s\S]*字段名转换冲突[\s\S]*options\.sortKeys/, productivity],
  ["canvas exposes the JSON formatter rules as business controls", /process:[\s\S]*"keyCase"[\s\S]*"stringCase"[\s\S]*"indent"[\s\S]*"sortKeys"[\s\S]*"trimStrings"[\s\S]*"omitNull"/, readFileSync(resolve(desktopRoot, "src/features/canvas/nodeBusinessSurface.ts"), "utf8")],
  ["JSON display validates and emits formatted text for the inspector", /id:\s*"flux\.output\.jsonView"[\s\S]*JSON\.parse\(value\)[\s\S]*outputs:\s*\{ out:\s*\{ text:\s*value, json \} \}/, productivity],
  ["JSON utility capabilities remain registered", /\.\.\.productivityNodes/, builtinIndex],
  ["XML conversion validates source and generated documents", /XMLValidator\.validate/, structuredFormats],
  ["XML conversion uses a parser instead of string rewriting", /new XMLParser/, structuredFormats],
  ["XML conversion uses a builder instead of string rewriting", /new XMLBuilder/, structuredFormats],
  ["YAML and YML conversion uses the YAML document parser and serializer", /parseDocument[\s\S]*maxAliasCount[\s\S]*stringifyYaml/, structuredFormats],
  ["structured conversion nodes are registered for execution", /\.\.\.structuredFormatNodes/, builtinIndex],
];

const missing = requirements.filter(([, pattern, source]) => !pattern.test(source)).map(([label]) => label);
if (missing.length) {
  console.error(`Missing ${missing.length} business workflow requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Business workflow starter contract passed.");
