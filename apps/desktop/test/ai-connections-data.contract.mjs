import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const api = readFileSync(resolve(root, "src/lib/api.ts"), "utf8");
const store = readFileSync(resolve(root, "src/store/aiConnectionsStore.ts"), "utf8");

const aiApi = api.match(/export const aiApi = \{[\s\S]*?^\};/m)?.[0] ?? "";
const loadAction =
  store.match(/async load\(force = false\) \{[\s\S]*?\n  \},\n\n  async createAndTest/)?.[0] ?? "";
const createAction =
  store.match(/async createAndTest\(input\) \{[\s\S]*?\n  \},\n\n  async test/)?.[0] ?? "";
const testAction =
  store.match(/async test\(id\) \{[\s\S]*?\n  \},\n\n  async remove/)?.[0] ?? "";
const removeAction =
  store.match(/async remove\(id\) \{[\s\S]*?\n  \},\n\n  clearFeedback/)?.[0] ?? "";

const requirements = [
  [
    "the client exposes explicit provider and connection status unions",
    /export type AiProvider = "openai-compatible" \| "ollama"[\s\S]*export type AiConnectionStatus = "untested" \| "connected" \| "unavailable"/,
    api,
  ],
  [
    "connection creation accepts an optional secret while responses expose only hasApiKey",
    /export interface AiConnection \{[\s\S]*hasApiKey:\s*boolean[\s\S]*status:\s*AiConnectionStatus[\s\S]*\}[\s\S]*export interface CreateAiConnectionInput \{[\s\S]*apiKey\?:\s*string[\s\S]*\}/,
    api,
  ],
  [
    "the connection collection supports list and JSON create requests",
    /listConnections:\s*\(\) => request<AiConnection\[]>\("\/ai\/connections"\)[\s\S]*createConnection:\s*\(input: CreateAiConnectionInput\) =>[\s\S]*request<AiConnection>\("\/ai\/connections", \{[\s\S]*method:\s*"POST"[\s\S]*body:\s*JSON\.stringify\(input\)/,
    aiApi,
  ],
  [
    "connection validation and removal use the per-connection endpoints",
    /testConnection:\s*\(id: string\) =>[\s\S]*`\/ai\/connections\/\$\{id\}\/test`[\s\S]*method:\s*"POST"[\s\S]*removeConnection:\s*\(id: string\) =>[\s\S]*`\/ai\/connections\/\$\{id\}`[\s\S]*method:\s*"DELETE"/,
    aiApi,
  ],
  [
    "the completion client carries connection, model, prompt, and token options to the server",
    /complete:\s*\(input: \{[\s\S]*connectionId\?: string[\s\S]*model\?: string[\s\S]*prompt: string[\s\S]*maxTokens\?: number[\s\S]*request<AiCompletionResult>\("\/ai\/completions", \{[\s\S]*method:\s*"POST"[\s\S]*body:\s*JSON\.stringify\(input\)/,
    aiApi,
  ],
  [
    "load coalesces in-flight and ready reads while allowing an explicit retry",
    /const current = get\(\)\.loadStatus[\s\S]*if \(!force && \(current === "loading" \|\| current === "ready"\)\) return[\s\S]*set\(\{ loadStatus: "loading", error: null \}\)[\s\S]*aiApi\.listConnections\(\)[\s\S]*loadStatus: "ready"/,
    loadAction,
  ],
  [
    "create-and-test persists the created connection before validation replaces it",
    /aiApi\.createConnection\(input\)[\s\S]*replaceConnection\(state\.connections, created\)[\s\S]*aiApi\.testConnection\(created\.id\)[\s\S]*replaceConnection\(state\.connections, tested\)[\s\S]*return tested/,
    createAction,
  ],
  [
    "a validation transport failure keeps the newly created connection usable for recovery",
    /catch \(error\) \{[\s\S]*模型服务已保存，但暂时无法完成连接校验。[\s\S]*return created/,
    createAction,
  ],
  [
    "manual validation identifies its pending row and replaces that connection",
    /pendingAction:\s*`test:\$\{id\}`[\s\S]*aiApi\.testConnection\(id\)[\s\S]*replaceConnection\(state\.connections, tested\)[\s\S]*return tested[\s\S]*throw error/,
    testAction,
  ],
  [
    "removal waits for the API before deleting the local connection",
    /pendingAction:\s*`remove:\$\{id\}`[\s\S]*await aiApi\.removeConnection\(id\)[\s\S]*connections:\s*state\.connections\.filter\(\(item\) => item\.id !== id\)[\s\S]*notice:\s*"模型服务已断开。"/,
    removeAction,
  ],
];

const missing = requirements
  .filter(([, pattern, source]) => !pattern.test(source))
  .map(([label]) => label);

if (missing.length > 0) {
  console.error(`Missing ${missing.length} AI connection data requirement(s):`);
  for (const label of missing) console.error(`- ${label}`);
  process.exit(1);
}

console.log("AI connections API/store contract passed.");
