import { defineNode } from "../registry.js";
import type { NodeDefinition } from "../types.js";

/** 1. 手动触发：工作流入口 */
export const manualTriggerNode = defineNode({
  id: "flux.trigger.manual",
  name: "手动触发",
  category: "触发器",
  icon: "zap",
  version: "0.1.0",
  carrier: "trigger",
  ports: { inputs: [], outputs: [{ id: "out", name: "开始" }] },
  configSchema: { type: "object", properties: {} },
  async execute() {
    return { outputs: { out: { startedAt: new Date().toISOString() } } };
  },
});

/** 2. HTTP 请求 */
export const httpRequestNode = defineNode({
  id: "flux.action.http",
  name: "HTTP 请求",
  category: "网络",
  icon: "globe",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "响应" }],
  },
  configSchema: {
    type: "object",
    required: ["url"],
    properties: {
      method: {
        type: "string",
        title: "方法",
        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
        default: "GET",
      },
      url: { type: "string", title: "URL" },
      headers: { type: "object", title: "请求头" },
      body: { type: "string", title: "请求体", format: "textarea" },
    },
  },
  async execute(ctx) {
    const { method = "GET", url, headers, body } = ctx.config as {
      method?: string;
      url: string;
      headers?: Record<string, string>;
      body?: string;
    };
    ctx.log("info", `HTTP ${method} ${url}`);
    const res = await fetch(url, {
      method,
      headers: headers as Record<string, string> | undefined,
      body: method === "GET" || method === "DELETE" ? undefined : body,
      signal: ctx.signal,
    });
    const text = await res.text();
    return { outputs: { out: { status: res.status, body: text } } };
  },
});

/** 3. 延时 */
export const delayNode = defineNode({
  id: "flux.action.delay",
  name: "延时",
  category: "流程",
  icon: "clock",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    properties: {
      ms: { type: "number", title: "延时(毫秒)", default: 1000 },
    },
  },
  async execute(ctx) {
    const ms = Number((ctx.config as { ms?: number }).ms ?? 1000);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, ms);
      ctx.signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("已取消"));
      });
    });
    return { outputs: { out: ctx.inputs } };
  },
});

/** 4. 条件分支：表达式为真走 true 出口，否则 false */
export const conditionNode = defineNode({
  id: "flux.logic.condition",
  name: "条件分支",
  category: "流程",
  icon: "git-branch",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [
      { id: "true", name: "真" },
      { id: "false", name: "假" },
    ],
  },
  configSchema: {
    type: "object",
    required: ["expression"],
    properties: {
      expression: {
        type: "string",
        title: "条件表达式",
        description: "可引用 input，例如 input.status === 200",
        format: "code",
      },
    },
  },
  async execute(ctx) {
    const expr = String((ctx.config as { expression?: string }).expression ?? "false");
    let result = false;
    try {
      // 占位实现：真实环境应在沙箱中求值（见 PRD 安全约束）
      const fn = new Function("input", `return (${expr});`);
      result = Boolean(fn(ctx.inputs));
    } catch (err) {
      ctx.log("error", `条件表达式求值失败: ${(err as Error).message}`);
    }
    return result
      ? { outputs: { true: ctx.inputs } }
      : { outputs: { false: ctx.inputs } };
  },
});

/** 5. 日志输出 */
export const logNode = defineNode({
  id: "flux.action.log",
  name: "日志输出",
  category: "调试",
  icon: "file-text",
  version: "0.1.0",
  carrier: "basic",
  ports: {
    inputs: [{ id: "in", name: "输入" }],
    outputs: [{ id: "out", name: "输出" }],
  },
  configSchema: {
    type: "object",
    properties: {
      message: { type: "string", title: "消息模板", format: "textarea" },
    },
  },
  async execute(ctx) {
    const message =
      (ctx.config as { message?: string }).message ??
      JSON.stringify(ctx.inputs);
    ctx.log("info", message);
    return { outputs: { out: ctx.inputs } };
  },
});

export const builtinNodes: NodeDefinition[] = [
  manualTriggerNode,
  httpRequestNode,
  delayNode,
  conditionNode,
  logNode,
];
