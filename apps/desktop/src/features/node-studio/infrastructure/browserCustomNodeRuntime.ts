import {
  CUSTOM_NODE_RULES,
  deriveCustomNodeCarrier,
  type CustomNodeDraft,
  type NodeContext,
  type NodeDefinition,
  type NodeOutput,
} from "@flux/node-sdk";
import type {
  ActiveCustomNodeRevision,
  CustomNodeTestReport,
  CustomNodeTestResult,
} from "../domain/customNodePackage.js";

type CapabilityInvoker = (
  capabilityKey: string,
  action: string,
  payload?: unknown,
) => Promise<unknown>;

interface RuntimeOptions {
  input: unknown;
  config: Record<string, unknown>;
  invoke?: CapabilityInvoker;
  log?: (level: "info" | "warn" | "error", message: string) => void;
  signal?: AbortSignal;
}

interface WorkerMessage {
  kind: "result" | "error" | "log" | "invoke";
  result?: unknown;
  name?: string;
  message?: string;
  code?: string;
  level?: "info" | "warn" | "error";
  requestId?: string;
  capabilityKey?: string;
  action?: string;
  payload?: unknown;
}

const WORKER_SOURCE = String.raw`
const pendingInvocations = new Map();
let invocationCounter = 0;

for (const key of [
  "fetch", "XMLHttpRequest", "WebSocket", "EventSource", "importScripts",
  "indexedDB", "caches", "navigator"
]) {
  try {
    Object.defineProperty(self, key, {
      value: undefined,
      configurable: false,
      writable: false,
    });
  } catch {}
}

function sendError(error) {
  self.postMessage({
    kind: "error",
    name: error && typeof error.name === "string" ? error.name : "Error",
    message: error && typeof error.message === "string" ? error.message : String(error),
    code: error && typeof error.code === "string" ? error.code : undefined,
  });
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message && message.kind === "invoke-result") {
    const pending = pendingInvocations.get(message.requestId);
    if (!pending) return;
    pendingInvocations.delete(message.requestId);
    if (message.ok) pending.resolve(message.value);
    else {
      const error = new Error(message.error || "能力调用失败");
      error.code = message.code;
      pending.reject(error);
    }
    return;
  }

  if (!message || message.kind !== "run") return;
  const invoke = (capabilityKey, action, payload) => new Promise((resolve, reject) => {
    const requestId = String(++invocationCounter);
    pendingInvocations.set(requestId, { resolve, reject });
    self.postMessage({ kind: "invoke", requestId, capabilityKey, action, payload });
  });
  const log = (level, text) => {
    const normalizedLevel = ["info", "warn", "error"].includes(level) ? level : "info";
    const normalizedText = text === undefined ? level : text;
    self.postMessage({ kind: "log", level: normalizedLevel, message: String(normalizedText) });
  };

  try {
    const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
    const execute = new AsyncFunction(
      "input",
      "config",
      "invoke",
      "log",
      "signal",
      '"use strict";\n' + message.source,
    );
    const result = await execute(
      message.input,
      message.config,
      invoke,
      log,
      Object.freeze({ aborted: false }),
    );
    self.postMessage({ kind: "result", result });
  } catch (error) {
    sendError(error);
  }
};
`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeOutput(
  draft: CustomNodeDraft,
  value: unknown,
): NodeOutput {
  if (!isRecord(value) || !isRecord(value.outputs)) {
    throw new Error("节点必须返回 { outputs: { 端口ID: 值 } }");
  }
  const allowedOutputs = new Set(draft.ports.outputs.map((port) => port.id));
  for (const outputId of Object.keys(value.outputs)) {
    if (!allowedOutputs.has(outputId)) {
      throw new Error(`节点返回了未声明的输出端口：${outputId}`);
    }
  }
  const serialized = JSON.stringify(value.outputs);
  if (serialized === undefined) throw new Error("节点输出必须能够序列化为 JSON");
  if (new Blob([serialized]).size > CUSTOM_NODE_RULES.maxOutputBytes) {
    throw new Error("节点输出超过 1MB 限制");
  }
  return { outputs: value.outputs };
}

export function runCustomNodeDraft(
  draft: CustomNodeDraft,
  options: RuntimeOptions,
): Promise<NodeOutput> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], {
      type: "text/javascript",
    }));
    const worker = new Worker(blobUrl, { name: `flux-node-${draft.slug}` });
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onAbort);
      worker.terminate();
      URL.revokeObjectURL(blobUrl);
      callback();
    };
    const fail = (error: Error) => finish(() => reject(error));
    const onAbort = () => fail(new DOMException("节点执行已取消", "AbortError"));
    const timeoutId = window.setTimeout(() => {
      fail(new Error(`节点执行超过 ${CUSTOM_NODE_RULES.runtimeTimeoutMs}ms 限制`));
    }, CUSTOM_NODE_RULES.runtimeTimeoutMs);

    if (options.signal?.aborted) {
      onAbort();
      return;
    }
    options.signal?.addEventListener("abort", onAbort, { once: true });

    worker.onerror = (event) => {
      fail(new Error(event.message || "节点隔离运行环境异常"));
    };
    worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
      const message = event.data;
      if (message.kind === "log") {
        options.log?.(message.level ?? "info", message.message ?? "");
        return;
      }
      if (message.kind === "invoke") {
        const requestId = message.requestId;
        if (!requestId) return;
        const invoker = options.invoke;
        if (!invoker) {
          worker.postMessage({
            kind: "invoke-result",
            requestId,
            ok: false,
            error: "测试环境没有绑定这项外部能力",
            code: "CAPABILITY_NOT_BOUND",
          });
          return;
        }
        void invoker(
          message.capabilityKey ?? "",
          message.action ?? "",
          message.payload,
        ).then(
          (value) => worker.postMessage({
            kind: "invoke-result",
            requestId,
            ok: true,
            value,
          }),
          (error: unknown) => worker.postMessage({
            kind: "invoke-result",
            requestId,
            ok: false,
            error: error instanceof Error ? error.message : "能力调用失败",
            code: isRecord(error) && typeof error.code === "string"
              ? error.code
              : undefined,
          }),
        );
        return;
      }
      if (message.kind === "error") {
        const error = new Error(message.message ?? "节点执行失败");
        error.name = message.name ?? "Error";
        if (message.code) Object.assign(error, { code: message.code });
        fail(error);
        return;
      }
      if (message.kind === "result") {
        try {
          const output = normalizeOutput(draft, message.result);
          finish(() => resolve(output));
        } catch (error) {
          fail(error instanceof Error ? error : new Error("节点输出无效"));
        }
      }
    };

    worker.postMessage({
      kind: "run",
      source: draft.implementation.source,
      input: options.input,
      config: options.config,
    });
  });
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

export async function runCustomNodeTestSuite(
  draft: CustomNodeDraft,
): Promise<CustomNodeTestReport> {
  const results: CustomNodeTestResult[] = [];
  for (const test of draft.tests) {
    const startedAt = performance.now();
    try {
      const output = await runCustomNodeDraft(draft, {
        input: test.input,
        config: test.config ?? {},
        invoke: async (capabilityKey, action) => {
          const mock = test.mocks?.find((item) =>
            item.key === capabilityKey && item.action === action,
          );
          if (!mock) {
            const error = new Error(`测试未提供能力模拟：${capabilityKey}.${action}`);
            Object.assign(error, { code: "CAPABILITY_MOCK_MISSING" });
            throw error;
          }
          if (mock.errorCode) {
            const error = new Error(`模拟能力错误：${mock.errorCode}`);
            Object.assign(error, { code: mock.errorCode });
            throw error;
          }
          return mock.response;
        },
      });
      if (test.kind === "error") {
        results.push({
          name: test.name,
          kind: test.kind,
          passed: false,
          durationMs: Math.round(performance.now() - startedAt),
          message: "预期执行失败，但节点返回了结果",
        });
        continue;
      }
      const passed = sameJson(output.outputs, test.expected.outputs);
      results.push({
        name: test.name,
        kind: test.kind,
        passed,
        durationMs: Math.round(performance.now() - startedAt),
        message: passed ? "输出符合预期" : "实际输出与预期不一致",
      });
    } catch (error) {
      const code = isRecord(error) && typeof error.code === "string"
        ? error.code
        : undefined;
      const passed = test.kind === "error" && code === test.expected.errorCode;
      results.push({
        name: test.name,
        kind: test.kind,
        passed,
        durationMs: Math.round(performance.now() - startedAt),
        message: passed
          ? `按预期返回错误 ${code}`
          : error instanceof Error ? error.message : "节点执行失败",
      });
    }
  }
  return {
    ranAt: new Date().toISOString(),
    passed: results.every((result) => result.passed),
    results,
  };
}

export function createCustomNodeDefinition(input: {
  id: string;
  revision: ActiveCustomNodeRevision;
}): NodeDefinition {
  const { id, revision } = input;
  const bindings = revision.bindings ?? {};
  const draft = revision.draft;
  return {
    id,
    name: draft.name,
    description: draft.description,
    category: draft.category,
    icon: draft.icon,
    version: String(revision.version),
    carrier: deriveCustomNodeCarrier(draft),
    ports: draft.ports,
    configSchema: draft.configSchema,
    runtimeInputSchema: draft.runtimeInput?.schema,
    runtimeInputPolicy: draft.runtimeInput?.policy,
    bindings: draft.capabilities.flatMap((capability) => {
      const bindingId = bindings[capability.key];
      return bindingId
        ? [{ bindingId, carrier: capability.carrier, label: capability.key }]
        : [];
    }),
    execute: (ctx: NodeContext) => runCustomNodeDraft(draft, {
      input: ctx.inputs,
      config: ctx.config,
      signal: ctx.signal,
      log: ctx.log,
      invoke: async (capabilityKey, action, payload) => {
        const bindingId = bindings[capabilityKey];
        if (!bindingId) {
          throw new Error(`外部能力 ${capabilityKey} 尚未绑定`);
        }
        ctx.log("info", `正在通过已授权连接调用 ${capabilityKey}.${action}`);
        return ctx.invoke(bindingId, action, payload);
      },
    }),
  };
}
