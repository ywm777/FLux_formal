import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const types = read("packages/node-sdk/src/types.ts");
const productivity = read("packages/node-sdk/src/builtin/productivity.ts");
const engine = read("packages/workflow-runtime/src/runtime.ts");
const processor = read("apps/api/src/modules/executions/execution-processor.service.ts");
const canvas = read("apps/desktop/src/features/canvas/CanvasView.tsx");
const fluxNode = read("apps/desktop/src/features/canvas/FluxNode.tsx");
const graphBridge = read("apps/desktop/src/features/canvas/graphBridge.ts");
const connectionPolicy = read("apps/desktop/src/features/canvas/connection/policy.ts");

const requirements = [
  [
    "SDK reserves one universal error output and error-handler role",
    /ERROR_OUTPUT_PORT_ID = "__error__"[\s\S]*executionRole\?: "error-handler"/,
    types,
  ],
  [
    "catalog exposes one generic error capture node",
    /id: "flux\.flow\.catchError"[\s\S]*executionRole: "error-handler"[\s\S]*name: "错误文本"/,
    productivity,
  ],
  [
    "one error handler input accepts multiple upstream failures",
    /ERROR_INPUT_PORT_ID[\s\S]*dataType: "error", capacity: "many"/,
    productivity,
  ],
  [
    "engine maps connections targeting an error handler onto its internal error channel",
    /errorHandlerNodeIds[\s\S]*const sourceKey[\s\S]*errorHandlerNodeIds\.has\(edge\.target\)[\s\S]*ERROR_OUTPUT_PORT_ID[\s\S]*activateErrorBranch[\s\S]*errorHandlerNodeIds\.has\(edge\.target\)[\s\S]*producedPorts\.add/,
    engine,
  ],
  [
    "handled node failures continue while unhandled failures still terminate",
    (source) =>
      /if \(activateErrorBranch\(nodeId, error, attempt \+ 1\)\) break/.test(source) &&
      /return \{ status: "failed", order, runs, logs \}/.test(source),
    engine,
  ],
  [
    "runtime aggregates values for ports whose capacity is many",
    /const acceptsMany =[\s\S]*=== "many"[\s\S]*Array\.isArray\(collected\)[\s\S]*\[\.\.\.collected, value\]/,
    engine,
  ],
  [
    "successful handled runs do not persist an execution-level error",
    /status === EXECUTION_STATUS\.FAILED \? failed\?\.error : undefined/,
    processor,
  ],
  [
    "canvas automatically classifies a common connection targeting an error handler",
    (source) =>
      /targetIsErrorHandler[\s\S]*data: \{ route: targetIsErrorHandler \? "error" : "normal" \}/.test(source) &&
      /isErrorPath = edge\.data\?\.route === "error" \|\| targetIsErrorHandler/.test(source) &&
      /异常 →/.test(source),
    canvas,
  ],
  [
    "error handlers accept every source data type before ordinary compatibility checks",
    /isErrorHandlerNode\(targetNode\)[\s\S]*typesCompatible\(sourcePort\.dataType[\s\S]*incompatible-type/,
    connectionPolicy,
  ],
  [
    "saved legacy error handles migrate onto normal visual ports without losing error routing",
    /e\.sourcePort === ERROR_OUTPUT_PORT_ID[\s\S]*sourceNode\.data\.outputs\[0\]\?\.id[\s\S]*data: \{ route \}/,
    graphBridge,
  ],
  [
    "saved nodes inherit current port capacities when definitions evolve",
    /currentPort = def\?\.ports\.inputs[\s\S]*resolvePortCapacity\(currentPort \?\? p, "input"\)/,
    graphBridge,
  ],
  [
    "canvas nodes do not expose a separate visible error connector",
    (source) => !/aria-label="异常输出"|errorHandleStyle|errorPortLabelStyle/.test(source),
    fluxNode,
  ],
];

const missing = requirements
  .filter(([, check, source]) => typeof check === "function" ? !check(source) : !check.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} error-capture requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Universal error-capture flow contract passed.");
