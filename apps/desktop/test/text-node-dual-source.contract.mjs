import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "../../..");
const read = (path) => readFileSync(resolve(repoRoot, path), "utf8");

const types = read("packages/node-sdk/src/types.ts");
const productivity = read("packages/node-sdk/src/builtin/productivity.ts");
const service = read("packages/workflow-runtime/src/runtime.ts");
const canvas = read("apps/desktop/src/features/canvas/CanvasView.tsx");
const fluxNode = read("apps/desktop/src/features/canvas/FluxNode.tsx");
const executionModel = read("apps/desktop/src/features/canvas/execution/canvasExecution.ts");

const requirements = [
  [
    "node SDK defines a reusable upstream-fallback runtime input policy",
    /runtimeInputPolicy\?: "required" \| "fallback"/,
    types,
  ],
  [
    "text input node exposes an upstream text port and fallback policy",
    /id: "flux\.input\.text"[\s\S]*inputs: \[\{ id: "in", name: "上游文本", dataType: "text" \}\][\s\S]*runtimeInputPolicy: "fallback"/,
    productivity,
  ],
  [
    "text input node prefers common upstream text fields and preserves manual fallback",
    /function resolveUpstreamText[\s\S]*"text", "value", "content", "result", "message"[\s\S]*source === "upstream" \? upstreamText : manualText/,
    productivity,
  ],
  [
    "API preflight waives manual input only for connected fallback nodes",
    /nodesWithUpstream[\s\S]*definition\?\.runtimeInputPolicy === "fallback" && nodesWithUpstream\.has\(node\.id\)/,
    service,
  ],
  [
    "canvas preflight and render state react to incoming connections",
    (source) =>
      /edges\.some\(\(edge\) => edge\.target === node\.id\)/.test(source) &&
      /upstreamConnected: edges\.some\(\(edge\) => edge\.target === node\.id\)/.test(source),
    canvas,
  ],
  [
    "execution preflight waives required input only for connected fallback nodes",
    /const acceptsUpstream = descriptor\.upstreamFallback && descriptor\.hasUpstream[\s\S]*!acceptsUpstream[\s\S]*descriptor\.required\.some/,
    executionModel,
  ],
  [
    "connected text nodes display business output without exposing source-selection details",
    (source) =>
      /showReceived = Boolean\(interaction\.upstreamConnected && receivedValue\)/.test(source) &&
      /if \(showReceived\)[\s\S]*<DeliveryOutput/.test(source) &&
      !/上游文本优先|备用文本|已接收上游文本/.test(source),
    fluxNode,
  ],
];

const missing = requirements
  .filter(([, check, source]) => typeof check === "function" ? !check(source) : !check.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} dual-source text requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("Text node dual-source contract passed.");
