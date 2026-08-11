import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const canvas = read("src/features/canvas/CanvasView.tsx");
const node = read("src/features/canvas/FluxNode.tsx");
const policy = read("src/features/canvas/connection/policy.ts");
const cardinality = read("src/features/canvas/connection/cardinality.ts");
const controller = read("src/features/canvas/connection/useCanvasConnectionController.ts");
const graphBridge = read("src/features/canvas/graphBridge.ts");
const schema = read("../../packages/workflow-schema/src/schema.ts");
const sdk = read("../../packages/node-sdk/src/types.ts");
const capacity = read("../../packages/node-sdk/src/port-capacity.ts");

const requirements = [
  [
    "ordinary nodes expose every available business direction on all four sides",
    /const ALL_ANCHORS[\s\S]*function inputAnchors[\s\S]*return ALL_ANCHORS[\s\S]*function outputAnchors[\s\S]*return ALL_ANCHORS/,
    node,
  ],
  [
    "visual handles normalize back to source outputs and target inputs",
    /normalizeCanvasConnection[\s\S]*sourceNode[\s\S]*targetNode[\s\S]*nodePorts\(sourceNode, "source"\)[\s\S]*nodePorts\(targetNode, "target"\)[\s\S]*createCanvasHandleId/,
    policy,
  ],
  [
    "connection validation rejects self-links, missing ports, incompatible types, duplicates, occupied ports, and cycles",
    /same-node[\s\S]*missing-port[\s\S]*incompatible-type[\s\S]*duplicate[\s\S]*source-occupied[\s\S]*target-occupied[\s\S]*cycle/,
    policy,
  ],
  [
    "new and reconnected edges pass through the same policy before atomic commands",
    /const commitNewConnection[\s\S]*validateCanvasConnection[\s\S]*createEdgeAtomically[\s\S]*const commitEdgeReconnect[\s\S]*validateCanvasConnection[\s\S]*reconnectEdgeAtomically/,
    canvas,
  ],
  [
    "the controller only searches for the opposite semantic direction",
    /expectedCandidateKind[\s\S]*session\.fixed\.kind === "source" \? "target" : "source"[\s\S]*findCanvasPortCandidate/,
    controller,
  ],
  [
    "persisted port capacity has direction-aware defaults",
    /InputPortSchema[\s\S]*default\("one"\)[\s\S]*OutputPortSchema[\s\S]*default\("many"\)/,
    schema,
  ],
  [
    "node SDK authors can opt a port into one-to-many behavior",
    /capacity\?:\s*"one" \| "many"/,
    sdk,
  ],
  [
    "one domain rule defaults outputs to fan-out and inputs to one upstream",
    /defaultPortCapacity[\s\S]*direction === "output" \? "many" : "one"/,
    capacity,
  ],
  [
    "canvas creation and persistence resolve capacity through the domain rule",
    /resolvePortCapacity\(p, "input"\)[\s\S]*resolvePortCapacity\(p, "output"\)/,
    graphBridge,
  ],
  [
    "used fan-out ports create branches while selected edges enter reconnect mode",
    /resolveConnectionStartIntent[\s\S]*selectedIncidentEdge[\s\S]*mode: "reconnect"[\s\S]*allowsAdditionalConnection[\s\S]*mode: "create"/,
    cardinality,
  ],
  [
    "canvas policy adapts graph state to the pure cardinality rule",
    /resolveCanvasConnectionStart[\s\S]*resolveConnectionStartIntent[\s\S]*resolvePortCapacity\(port, direction\)[\s\S]*incidentEdgeCount/,
    policy,
  ],
  [
    "the gesture controller delegates start intent to the capacity policy",
    /resolveCanvasConnectionStart[\s\S]*decision\.mode === "blocked"[\s\S]*decision\.mode === "reconnect"[\s\S]*beginCreateConnection/,
    controller,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} universal connection requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Canvas universal connection policy contract passed.");
